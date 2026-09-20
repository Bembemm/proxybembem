import type { AdminAccessResult } from "./admin-auth.ts"
import {
  ProductConflictError,
  ProductValidationError,
} from "./admin-products.ts"
import type { CatalogProduct } from "../products/product.ts"
import {
  validateProductMutationInput,
  type ProductMutationInput,
} from "../products/product-form.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "./env.ts"
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readJsonBody,
} from "./request-body.ts"

const PRODUCT_BODY_LIMIT = 131_072

export interface AdminProductActionContext {
  params: Promise<{ id: string }>
}

export interface AdminProductRouteDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  createDraftProduct(input: ProductMutationInput): Promise<CatalogProduct>
  updateProduct(
    id: number,
    expectedUpdatedAt: string,
    input: ProductMutationInput,
  ): Promise<CatalogProduct>
  publishProduct(id: number, expectedUpdatedAt: string): Promise<CatalogProduct>
  archiveProduct(id: number, expectedUpdatedAt: string): Promise<CatalogProduct>
  reactivateProduct(id: number, expectedUpdatedAt: string): Promise<CatalogProduct>
  invalidatePublicProductCatalog(): void | Promise<void>
}

type ProductMutationOperation =
  | "create"
  | "update"
  | "publish"
  | "archive"
  | "reactivate"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  })
}

function adminFailureStatus(result: Exclude<AdminAccessResult, { ok: true }>) {
  if (result.reason === "unavailable") return 503
  if (result.reason === "not_admin") return 403
  return 401
}

function isAllowedMutationOrigin(request: Request) {
  let requestOrigin: string
  let siteUrl: string

  try {
    requestOrigin = new URL(request.url).origin
    siteUrl = resolvePublicSiteUrl(requestOrigin)
  } catch {
    return false
  }

  return isAllowedCheckoutOrigin({
    originHeader: request.headers.get("origin"),
    configuredSiteUrl: siteUrl,
    requestOrigin,
    nodeEnv: process.env.NODE_ENV,
  })
}

async function authorizeMutation(
  request: Request,
  deps: AdminProductRouteDependencies,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!isAllowedMutationOrigin(request)) {
    return {
      ok: false,
      response: jsonResponse(403, { error: "admin_access_denied" }),
    }
  }

  let admin: AdminAccessResult
  try {
    admin = await deps.authorizeAdmin()
  } catch {
    return {
      ok: false,
      response: jsonResponse(503, { error: "admin_access_denied" }),
    }
  }

  if (!admin.ok) {
    return {
      ok: false,
      response: jsonResponse(adminFailureStatus(admin), {
        error: "admin_access_denied",
      }),
    }
  }

  return { ok: true }
}

async function readBoundedJson(request: Request) {
  try {
    return { ok: true as const, body: await readJsonBody(request, PRODUCT_BODY_LIMIT) }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return {
        ok: false as const,
        response: jsonResponse(413, { error: "invalid_request" }),
      }
    }
    if (error instanceof InvalidJsonBodyError) {
      return {
        ok: false as const,
        response: jsonResponse(400, { error: "invalid_request" }),
      }
    }
    return {
      ok: false as const,
      response: jsonResponse(400, { error: "invalid_request" }),
    }
  }
}

function parseProductId(value: string) {
  if (!/^\d{1,15}$/.test(value)) return null
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) return null
  return id
}

async function readProductId(context: AdminProductActionContext) {
  try {
    const params = await context.params
    return parseProductId(params.id)
  } catch {
    return null
  }
}

function validateExpectedUpdatedAt(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 80 ||
    !Number.isFinite(Date.parse(value))
  ) {
    return null
  }
  return value
}

async function invalidateCatalogAfterMutation(
  deps: AdminProductRouteDependencies,
) {
  try {
    await deps.invalidatePublicProductCatalog()
  } catch {
    // The database mutation is already durable. Do not turn a cache refresh
    // failure into a retryable product write that could duplicate work.
    console.error("Public product catalog cache invalidation failed")
  }
}

function productErrorResponse(error: unknown) {
  if (error instanceof ProductConflictError) {
    return jsonResponse(409, { error: "product_conflict" })
  }

  if (error instanceof ProductValidationError) {
    return jsonResponse(400, {
      error: "invalid_product",
      fieldErrors: error.fieldErrors,
    })
  }

  if (error instanceof Error && error.message === "Product not found") {
    return jsonResponse(404, { error: "product_not_found" })
  }

  if (
    error instanceof Error &&
    error.message === "Invalid product lifecycle transition"
  ) {
    return jsonResponse(409, { error: "invalid_product_transition" })
  }

  return jsonResponse(503, { error: "product_unavailable" })
}

function validateCreateBody(body: unknown) {
  const validated = validateProductMutationInput(body)
  if (!validated.ok) {
    return {
      ok: false as const,
      response: jsonResponse(400, {
        error: "invalid_product",
        fieldErrors: validated.fieldErrors,
      }),
    }
  }
  return { ok: true as const, input: validated.value }
}

function validateUpdateBody(body: unknown) {
  if (!isRecord(body)) {
    return {
      ok: false as const,
      response: jsonResponse(400, {
        error: "invalid_product",
        fieldErrors: { _form: "Dados do produto inválidos." },
      }),
    }
  }

  const expectedUpdatedAt = validateExpectedUpdatedAt(body.expectedUpdatedAt)
  if (!expectedUpdatedAt) {
    return {
      ok: false as const,
      response: jsonResponse(400, {
        error: "invalid_product",
        fieldErrors: { expectedUpdatedAt: "Revisão do produto inválida." },
      }),
    }
  }

  const { expectedUpdatedAt: _expectedUpdatedAt, ...productFields } = body
  const validated = validateProductMutationInput(productFields)
  if (!validated.ok) {
    return {
      ok: false as const,
      response: jsonResponse(400, {
        error: "invalid_product",
        fieldErrors: validated.fieldErrors,
      }),
    }
  }

  return {
    ok: true as const,
    expectedUpdatedAt,
    input: validated.value,
  }
}

function validateLifecycleBody(body: unknown) {
  if (!isRecord(body)) {
    return {
      ok: false as const,
      response: jsonResponse(400, { error: "invalid_request" }),
    }
  }

  const expectedUpdatedAt = validateExpectedUpdatedAt(body.expectedUpdatedAt)
  if (!expectedUpdatedAt) {
    return {
      ok: false as const,
      response: jsonResponse(400, {
        error: "invalid_product",
        fieldErrors: { expectedUpdatedAt: "Revisão do produto inválida." },
      }),
    }
  }

  return { ok: true as const, expectedUpdatedAt }
}

async function runLifecycleMutation(
  operation: Exclude<ProductMutationOperation, "create" | "update">,
  request: Request,
  context: AdminProductActionContext,
  deps: AdminProductRouteDependencies,
) {
  const authorized = await authorizeMutation(request, deps)
  if (!authorized.ok) return authorized.response

  const id = await readProductId(context)
  if (id === null) return jsonResponse(404, { error: "product_not_found" })

  const parsed = await readBoundedJson(request)
  if (!parsed.ok) return parsed.response

  const revision = validateLifecycleBody(parsed.body)
  if (!revision.ok) return revision.response

  try {
    const product = await deps[`${operation}Product`](id, revision.expectedUpdatedAt)
    await invalidateCatalogAfterMutation(deps)
    return jsonResponse(200, { product })
  } catch (error) {
    return productErrorResponse(error)
  }
}

export function createAdminProductRouteHandlers(
  deps: AdminProductRouteDependencies,
) {
  return {
    async create(request: Request) {
      const authorized = await authorizeMutation(request, deps)
      if (!authorized.ok) return authorized.response

      const parsed = await readBoundedJson(request)
      if (!parsed.ok) return parsed.response

      const validated = validateCreateBody(parsed.body)
      if (!validated.ok) return validated.response

      try {
        const product = await deps.createDraftProduct(validated.input)
        await invalidateCatalogAfterMutation(deps)
        return jsonResponse(201, { product })
      } catch (error) {
        return productErrorResponse(error)
      }
    },

    async update(request: Request, context: AdminProductActionContext) {
      const authorized = await authorizeMutation(request, deps)
      if (!authorized.ok) return authorized.response

      const id = await readProductId(context)
      if (id === null) return jsonResponse(404, { error: "product_not_found" })

      const parsed = await readBoundedJson(request)
      if (!parsed.ok) return parsed.response

      const validated = validateUpdateBody(parsed.body)
      if (!validated.ok) return validated.response

      try {
        const product = await deps.updateProduct(
          id,
          validated.expectedUpdatedAt,
          validated.input,
        )
        await invalidateCatalogAfterMutation(deps)
        return jsonResponse(200, { product })
      } catch (error) {
        return productErrorResponse(error)
      }
    },

    publish(request: Request, context: AdminProductActionContext) {
      return runLifecycleMutation("publish", request, context, deps)
    },

    archive(request: Request, context: AdminProductActionContext) {
      return runLifecycleMutation("archive", request, context, deps)
    },

    reactivate(request: Request, context: AdminProductActionContext) {
      return runLifecycleMutation("reactivate", request, context, deps)
    },
  }
}
