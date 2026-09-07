import { randomUUID } from "node:crypto"
import type { AdminAccessResult } from "./admin-auth.ts"
import {
  isAllowedCheckoutOrigin,
  resolvePublicSiteUrl,
} from "./env.ts"
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readJsonBody,
} from "./request-body.ts"
import { createSupabaseServiceClient } from "./supabase-service.ts"

const PRODUCT_IMAGE_BUCKET = "product-images"
const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024
const PRODUCT_IMAGE_METADATA_BODY_LIMIT = 16_384
const PRODUCT_IMAGE_FILENAME_MAX_LENGTH = 255
const PRODUCT_IMAGE_TOKEN_MAX_LENGTH = 16_384

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const

type ProductImageMimeType = keyof typeof MIME_EXTENSIONS

export interface ProductImageMetadata {
  originalFilename: string
  mimeType: ProductImageMimeType
  byteSize: number
}

export interface ProductImageUploadAuthorization {
  path: string
  token: string
}

interface ProductImageSigningDependencies {
  randomUUID(): string
  createSignedUploadUrl(
    bucket: string,
    path: string,
    options: { upsert: boolean },
  ): Promise<{ token: string }>
}

interface ProductImageUploadRouteDependencies {
  authorizeAdmin(): Promise<AdminAccessResult>
  issueSignedUpload(
    metadata: ProductImageMetadata,
  ): Promise<ProductImageUploadAuthorization>
}

type ProductImageFieldErrors = Partial<
  Record<keyof ProductImageMetadata | "_form", string>
>

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

function validateImageMetadata(value: unknown):
  | { ok: true; value: ProductImageMetadata }
  | { ok: false; fieldErrors: ProductImageFieldErrors } {
  if (!isRecord(value)) {
    return {
      ok: false,
      fieldErrors: { _form: "Dados da imagem inválidos." },
    }
  }

  const allowedKeys = new Set(["originalFilename", "mimeType", "byteSize"])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return {
      ok: false,
      fieldErrors: { _form: "Dados da imagem inválidos." },
    }
  }

  const fieldErrors: ProductImageFieldErrors = {}

  const originalFilename =
    typeof value.originalFilename === "string"
      ? value.originalFilename.trim()
      : ""
  if (
    originalFilename.length === 0 ||
    originalFilename.length > PRODUCT_IMAGE_FILENAME_MAX_LENGTH ||
    /[\\/\u0000-\u001f\u007f]/.test(originalFilename)
  ) {
    fieldErrors.originalFilename = "Nome do arquivo inválido."
  }

  const mimeType = value.mimeType
  if (
    typeof mimeType !== "string" ||
    !Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, mimeType)
  ) {
    fieldErrors.mimeType = "Formato de imagem inválido."
  }

  const byteSize = value.byteSize
  if (
    typeof byteSize !== "number" ||
    !Number.isSafeInteger(byteSize) ||
    byteSize <= 0 ||
    byteSize > PRODUCT_IMAGE_MAX_BYTES
  ) {
    fieldErrors.byteSize = "A imagem deve ter no máximo 8 MiB."
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors }
  }

  return {
    ok: true,
    value: {
      originalFilename,
      mimeType: mimeType as ProductImageMimeType,
      byteSize: byteSize as number,
    },
  }
}

function validateUploadAuthorization(
  value: unknown,
): ProductImageUploadAuthorization {
  if (!isRecord(value)) {
    throw new Error("Product image upload unavailable")
  }

  const path = value.path
  const token = value.token
  if (
    typeof path !== "string" ||
    !/^products\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(
      path,
    ) ||
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > PRODUCT_IMAGE_TOKEN_MAX_LENGTH
  ) {
    throw new Error("Product image upload unavailable")
  }

  return { path, token }
}

function productionSigningDependencies(): ProductImageSigningDependencies {
  return {
    randomUUID,
    async createSignedUploadUrl(bucket, path, options) {
      const supabase = createSupabaseServiceClient()
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(path, { upsert: options.upsert })

      if (
        error ||
        !data ||
        typeof data.token !== "string" ||
        data.token.length === 0 ||
        data.token.length > PRODUCT_IMAGE_TOKEN_MAX_LENGTH
      ) {
        throw new Error("Product image upload unavailable")
      }

      return { token: data.token }
    },
  }
}

export async function createSignedProductImageUpload(
  metadata: unknown,
  deps: ProductImageSigningDependencies = productionSigningDependencies(),
): Promise<ProductImageUploadAuthorization> {
  const validated = validateImageMetadata(metadata)
  if (!validated.ok) {
    throw new Error("Invalid product image metadata")
  }

  const extension = MIME_EXTENSIONS[validated.value.mimeType]
  const path = `products/${deps.randomUUID()}.${extension}`
  const signed = await deps.createSignedUploadUrl(PRODUCT_IMAGE_BUCKET, path, {
    upsert: false,
  })

  return validateUploadAuthorization({ path, token: signed.token })
}

export function createProductImageUploadHandler(
  deps: ProductImageUploadRouteDependencies,
) {
  return async function handleProductImageUpload(request: Request) {
    if (!isAllowedMutationOrigin(request)) {
      return jsonResponse(403, { error: "admin_access_denied" })
    }

    let admin: AdminAccessResult
    try {
      admin = await deps.authorizeAdmin()
    } catch {
      return jsonResponse(503, { error: "admin_access_denied" })
    }

    if (!admin.ok) {
      return jsonResponse(adminFailureStatus(admin), {
        error: "admin_access_denied",
      })
    }

    let body: unknown
    try {
      body = await readJsonBody(request, PRODUCT_IMAGE_METADATA_BODY_LIMIT)
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return jsonResponse(413, { error: "invalid_request" })
      }
      if (error instanceof InvalidJsonBodyError) {
        return jsonResponse(400, { error: "invalid_request" })
      }
      return jsonResponse(400, { error: "invalid_request" })
    }

    const validated = validateImageMetadata(body)
    if (!validated.ok) {
      return jsonResponse(400, {
        error: "invalid_product_image",
        fieldErrors: validated.fieldErrors,
      })
    }

    try {
      const authorization = validateUploadAuthorization(
        await deps.issueSignedUpload(validated.value),
      )
      return jsonResponse(200, authorization)
    } catch {
      return jsonResponse(503, { error: "product_image_unavailable" })
    }
  }
}
