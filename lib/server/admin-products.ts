import {
  validateProductMutationInput,
  type ProductFieldErrors,
  type ProductMutationInput,
} from "../products/product-form.ts"
import {
  parseProductRow,
  type CatalogProduct,
  type ProductStatus,
} from "../products/product.ts"
import { getSupabaseEnv } from "./env.ts"
import { getAdminProduct } from "./product-catalog.ts"

const PRODUCT_SELECT = [
  "id",
  "status",
  "title",
  "category",
  "tag",
  "featured",
  "image_path",
  "original_price_cents",
  "price_cents",
  "description",
  "notice",
  "colors",
  "highlights",
  "details",
  "sections",
  "shipping_weight_kg",
  "shipping_length_cm",
  "shipping_width_cm",
  "shipping_height_cm",
  "display_order",
  "created_at",
  "updated_at",
].join(",")

export class ProductConflictError extends Error {
  constructor() {
    super("Product was changed by another session")
    this.name = "ProductConflictError"
  }
}

export class ProductValidationError extends Error {
  readonly fieldErrors: ProductFieldErrors

  constructor(fieldErrors: ProductFieldErrors) {
    super("Invalid product mutation input")
    this.name = "ProductValidationError"
    this.fieldErrors = fieldErrors
  }
}

function assertProductId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid product id")
  }
}

function assertExpectedUpdatedAt(value: string) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 80 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error("Invalid product revision")
  }
}

function validatedInput(value: ProductMutationInput) {
  const result = validateProductMutationInput(value)
  if (!result.ok) throw new ProductValidationError(result.fieldErrors)
  return result.value
}

function toStorageFields(input: ProductMutationInput) {
  return {
    title: input.title,
    category: input.category,
    tag: input.tag,
    featured: input.featured,
    image_path: input.imagePath,
    original_price_cents: input.originalPriceCents,
    price_cents: input.priceCents,
    description: input.description,
    notice: input.notice,
    colors: input.colors,
    highlights: input.highlights,
    details: input.details,
    sections: input.sections,
    shipping_weight_kg: input.shipping.weightKg,
    shipping_length_cm: input.shipping.lengthCm,
    shipping_width_cm: input.shipping.widthCm,
    shipping_height_cm: input.shipping.heightCm,
    display_order: input.displayOrder,
  }
}

async function mutationRequest(
  params: URLSearchParams,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response

  try {
    response = await fetch(`${supabaseUrl}/rest/v1/products?${params.toString()}`, {
      method,
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase admin product mutation failed", { method, status: "network" })
    throw new Error("Admin product mutation failed")
  }

  if (!response.ok) {
    console.error("Supabase admin product mutation failed", {
      method,
      status: response.status,
    })
    throw new Error("Admin product mutation failed")
  }

  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) {
    throw new Error("Invalid admin product mutation response")
  }

  return {
    products: payload.map((value) => parseProductRow(value, supabaseUrl)),
  }
}

function parseSingleMutationResult(
  products: CatalogProduct[],
  expectedId?: number,
  expectedStatus?: ProductStatus,
) {
  if (products.length !== 1) {
    throw new Error("Invalid admin product mutation response")
  }

  const product = products[0]
  if (
    !product ||
    (expectedId !== undefined && product.id !== expectedId) ||
    (expectedStatus !== undefined && product.status !== expectedStatus)
  ) {
    throw new Error("Invalid admin product mutation response")
  }
  return product
}

async function resolveMutationMiss(
  id: number,
  expectedUpdatedAt: string,
  allowedFrom?: readonly ProductStatus[],
): Promise<never> {
  const current = await getAdminProduct(id)
  if (!current) throw new Error("Product not found")
  if (current.updatedAt !== expectedUpdatedAt) throw new ProductConflictError()
  if (allowedFrom && !allowedFrom.includes(current.status)) {
    throw new Error("Invalid product lifecycle transition")
  }
  throw new ProductConflictError()
}

function mutationParams(
  id: number,
  expectedUpdatedAt: string,
  currentStatus?: ProductStatus | "draft_or_published",
) {
  const params = new URLSearchParams({
    select: PRODUCT_SELECT,
    id: `eq.${id}`,
    updated_at: `eq.${expectedUpdatedAt}`,
  })

  if (currentStatus === "draft_or_published") {
    params.set("status", "in.(draft,published)")
  } else if (currentStatus) {
    params.set("status", `eq.${currentStatus}`)
  }
  return params
}

export async function createDraftProduct(
  input: ProductMutationInput,
): Promise<CatalogProduct> {
  const normalized = validatedInput(input)
  const params = new URLSearchParams({ select: PRODUCT_SELECT })
  const { products } = await mutationRequest(params, "POST", {
    status: "draft",
    ...toStorageFields(normalized),
  })
  return parseSingleMutationResult(products, undefined, "draft")
}

export async function updateProduct(
  id: number,
  expectedUpdatedAt: string,
  input: ProductMutationInput,
): Promise<CatalogProduct> {
  assertProductId(id)
  assertExpectedUpdatedAt(expectedUpdatedAt)
  const normalized = validatedInput(input)
  const { products } = await mutationRequest(
    mutationParams(id, expectedUpdatedAt),
    "PATCH",
    toStorageFields(normalized),
  )
  if (products.length === 0) {
    return resolveMutationMiss(id, expectedUpdatedAt)
  }
  return parseSingleMutationResult(products, id)
}

export async function publishProduct(
  id: number,
  expectedUpdatedAt: string,
): Promise<CatalogProduct> {
  assertProductId(id)
  assertExpectedUpdatedAt(expectedUpdatedAt)
  const { products } = await mutationRequest(
    mutationParams(id, expectedUpdatedAt, "draft"),
    "PATCH",
    { status: "published" },
  )
  if (products.length === 0) {
    return resolveMutationMiss(id, expectedUpdatedAt, ["draft"])
  }
  return parseSingleMutationResult(products, id, "published")
}

export async function archiveProduct(
  id: number,
  expectedUpdatedAt: string,
): Promise<CatalogProduct> {
  assertProductId(id)
  assertExpectedUpdatedAt(expectedUpdatedAt)
  const { products } = await mutationRequest(
    mutationParams(id, expectedUpdatedAt, "draft_or_published"),
    "PATCH",
    { status: "archived" },
  )
  if (products.length === 0) {
    return resolveMutationMiss(id, expectedUpdatedAt, ["draft", "published"])
  }
  return parseSingleMutationResult(products, id, "archived")
}

export async function reactivateProduct(
  id: number,
  expectedUpdatedAt: string,
): Promise<CatalogProduct> {
  assertProductId(id)
  assertExpectedUpdatedAt(expectedUpdatedAt)
  const { products } = await mutationRequest(
    mutationParams(id, expectedUpdatedAt, "archived"),
    "PATCH",
    { status: "draft" },
  )
  if (products.length === 0) {
    return resolveMutationMiss(id, expectedUpdatedAt, ["archived"])
  }
  return parseSingleMutationResult(products, id, "draft")
}
