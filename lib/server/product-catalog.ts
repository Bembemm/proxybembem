import {
  isProductStatus,
  parseProductRow,
  parsePublishedProductSummaryRow,
  type CatalogProduct,
  type ProductStatus,
  type StorefrontProduct,
} from "../products/product.ts"
import { getSupabaseEnv } from "./env.ts"

const PUBLIC_PRODUCT_SUMMARY_SELECT = [
  "id",
  "status",
  "title",
  "category",
  "tag",
  "featured",
  "image_path",
  "original_price_cents",
  "price_cents",
].join(",")

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

const MAX_PUBLIC_PRODUCTS = 500
const MAX_ADMIN_QUERY = 100
const MAX_ADMIN_PAGE_SIZE = 50
const MAX_ADMIN_OFFSET = 10_000

export interface ListAdminProductsInput {
  query?: string
  status?: ProductStatus
  page?: number
  pageSize?: number
}

export interface AdminProductListResult {
  products: CatalogProduct[]
  total: number
  page: number
  pageSize: number
}

function assertProductId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid product id")
  }
}

async function productCatalogRequest(params: URLSearchParams, init?: RequestInit) {
  const { supabaseUrl, supabaseSecretKey } = getSupabaseEnv()
  let response: Response

  try {
    response = await fetch(`${supabaseUrl}/rest/v1/products?${params.toString()}`, {
      ...init,
      headers: {
        apikey: supabaseSecretKey,
        Accept: "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    console.error("Supabase product catalog request failed", { status: "network" })
    throw new Error("Product catalog storage request failed")
  }

  if (!response.ok) {
    console.error("Supabase product catalog request failed", { status: response.status })
    throw new Error("Product catalog storage request failed")
  }

  return { response, supabaseUrl }
}

async function parseRows(
  response: Response,
  supabaseUrl: string,
): Promise<CatalogProduct[]> {
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) {
    throw new Error("Invalid product catalog response")
  }
  return payload.map((value) => parseProductRow(value, supabaseUrl))
}

async function parseSummaryRows(
  response: Response,
  supabaseUrl: string,
): Promise<StorefrontProduct[]> {
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) {
    throw new Error("Invalid product catalog response")
  }
  return payload.map((value) => parsePublishedProductSummaryRow(value, supabaseUrl))
}

export async function listPublishedProductSummaries(): Promise<StorefrontProduct[]> {
  const params = new URLSearchParams({
    select: PUBLIC_PRODUCT_SUMMARY_SELECT,
    status: "eq.published",
    order: "display_order.asc,id.asc",
    limit: String(MAX_PUBLIC_PRODUCTS),
  })

  const { response, supabaseUrl } = await productCatalogRequest(params)
  return parseSummaryRows(response, supabaseUrl)
}

export async function listPublishedProducts(): Promise<CatalogProduct[]> {
  const params = new URLSearchParams({
    select: PRODUCT_SELECT,
    status: "eq.published",
    order: "display_order.asc,id.asc",
    limit: String(MAX_PUBLIC_PRODUCTS),
  })

  const { response, supabaseUrl } = await productCatalogRequest(params)
  const products = await parseRows(response, supabaseUrl)
  if (products.some((product) => product.status !== "published")) {
    throw new Error("Invalid product catalog response")
  }
  return products
}

export async function getPublishedProductsByIds(
  ids: number[],
): Promise<CatalogProduct[]> {
  if (!Array.isArray(ids) || ids.length > 50) {
    throw new Error("Invalid product ids")
  }

  const uniqueIds = [...new Set(ids)]
  for (const id of uniqueIds) assertProductId(id)
  uniqueIds.sort((left, right) => left - right)
  if (uniqueIds.length === 0) return []

  const params = new URLSearchParams({
    select: PRODUCT_SELECT,
    status: "eq.published",
    id: `in.(${uniqueIds.join(",")})`,
    order: "id.asc",
    limit: String(uniqueIds.length),
  })

  const { response, supabaseUrl } = await productCatalogRequest(params)
  const products = await parseRows(response, supabaseUrl)
  const requested = new Set(uniqueIds)
  if (
    products.some(
      (product) => product.status !== "published" || !requested.has(product.id),
    )
  ) {
    throw new Error("Invalid product catalog response")
  }
  return products
}

function normalizeAdminListInput(input: ListAdminProductsInput) {
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? 25
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("Invalid admin product page")
  }
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_ADMIN_PAGE_SIZE
  ) {
    throw new Error("Invalid admin product page size")
  }

  const offset = (page - 1) * pageSize
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_ADMIN_OFFSET) {
    throw new Error("Invalid admin product page")
  }

  const query = input.query?.trim() ?? ""
  if (query.length > MAX_ADMIN_QUERY) {
    throw new Error("Invalid admin product query")
  }
  if (input.status !== undefined && !isProductStatus(input.status)) {
    throw new Error("Invalid admin product status")
  }

  return { page, pageSize, offset, query, status: input.status }
}

function parseContentRangeTotal(value: string | null) {
  if (!value) throw new Error("Invalid product catalog response")
  const match = /\/(\d+)$/.exec(value)
  if (!match) throw new Error("Invalid product catalog response")
  const total = Number(match[1])
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Invalid product catalog response")
  }
  return total
}

export async function listAdminProducts(
  input: ListAdminProductsInput = {},
): Promise<AdminProductListResult> {
  const normalized = normalizeAdminListInput(input)
  const params = new URLSearchParams({
    select: PRODUCT_SELECT,
    order: "display_order.asc,id.asc",
    limit: String(normalized.pageSize),
    offset: String(normalized.offset),
  })
  if (normalized.status) params.set("status", `eq.${normalized.status}`)
  if (normalized.query) params.set("title", `ilike.*${normalized.query}*`)

  const { response, supabaseUrl } = await productCatalogRequest(params, {
    headers: { Prefer: "count=exact" },
  })
  const products = await parseRows(response, supabaseUrl)
  const total = parseContentRangeTotal(response.headers.get("Content-Range"))

  return {
    products,
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
  }
}

export async function getAdminProduct(id: number): Promise<CatalogProduct | null> {
  assertProductId(id)
  const params = new URLSearchParams({
    select: PRODUCT_SELECT,
    id: `eq.${id}`,
    limit: "1",
  })

  const { response, supabaseUrl } = await productCatalogRequest(params)
  const products = await parseRows(response, supabaseUrl)
  if (products.length === 0) return null
  if (products.length !== 1 || products[0]?.id !== id) {
    throw new Error("Invalid product catalog response")
  }
  return products[0]
}
