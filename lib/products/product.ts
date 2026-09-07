export type ProductStatus = "draft" | "published" | "archived"

export interface ProductDetail {
  label: string
  value: string
}

export interface ProductSection {
  title: string
  paragraphs: string[]
}

export interface ProductShipping {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export interface Product {
  id: number
  status: ProductStatus
  title: string
  image: string
  imagePath: string
  originalPrice: number
  discountPrice: number
  tag: string | null
  category: string
  colors?: string[]
  featured?: boolean
  notice?: string
  highlights?: string[]
  description: string
  details: ProductDetail[]
  sections: ProductSection[]
  shipping: ProductShipping
  displayOrder: number
  createdAt: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max
}

function isNullableBoundedString(
  value: unknown,
  max: number,
): value is string | null {
  return value === null || isBoundedString(value, 1, max)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && Number.isFinite(Date.parse(value))
}

export function isProductStatus(value: unknown): value is ProductStatus {
  return value === "draft" || value === "published" || value === "archived"
}

function parseStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error("Invalid product catalog response")
  }

  if (value.some((item) => !isBoundedString(item, 1, maxLength))) {
    throw new Error("Invalid product catalog response")
  }

  return [...value] as string[]
}

function parseDetails(value: unknown): ProductDetail[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error("Invalid product catalog response")
  }

  return value.map((item) => {
    if (
      !isRecord(item) ||
      !isBoundedString(item.label, 1, 160) ||
      !isBoundedString(item.value, 1, 3000)
    ) {
      throw new Error("Invalid product catalog response")
    }
    return { label: item.label, value: item.value }
  })
}

function parseSections(value: unknown): ProductSection[] {
  if (!Array.isArray(value) || value.length > 30) {
    throw new Error("Invalid product catalog response")
  }

  return value.map((item) => {
    if (!isRecord(item) || !isBoundedString(item.title, 1, 160)) {
      throw new Error("Invalid product catalog response")
    }
    return {
      title: item.title,
      paragraphs: parseStringArray(item.paragraphs, 30, 5000),
    }
  })
}

function publicImageUrl(imagePath: string, supabaseUrl: string) {
  if (imagePath.startsWith("/")) return imagePath
  if (imagePath.includes("..") || imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    throw new Error("Invalid product catalog response")
  }

  const encodedPath = imagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
  return `${new URL(supabaseUrl).origin}/storage/v1/object/public/product-images/${encodedPath}`
}

export function parseProductRow(value: unknown, supabaseUrl: string): Product {
  if (!isRecord(value)) throw new Error("Invalid product catalog response")

  if (
    !isPositiveSafeInteger(value.id) ||
    !isProductStatus(value.status) ||
    !isBoundedString(value.title, 1, 160) ||
    !isBoundedString(value.category, 1, 80) ||
    !isNullableBoundedString(value.tag, 80) ||
    typeof value.featured !== "boolean" ||
    !isBoundedString(value.image_path, 1, 500) ||
    !isPositiveSafeInteger(value.original_price_cents) ||
    !isPositiveSafeInteger(value.price_cents) ||
    !isBoundedString(value.description, 1, 5000) ||
    !isNullableBoundedString(value.notice, 500) ||
    !isPositiveFiniteNumber(value.shipping_weight_kg) ||
    !isPositiveFiniteNumber(value.shipping_length_cm) ||
    !isPositiveFiniteNumber(value.shipping_width_cm) ||
    !isPositiveFiniteNumber(value.shipping_height_cm) ||
    !isNonnegativeSafeInteger(value.display_order) ||
    !isIsoTimestamp(value.created_at) ||
    !isIsoTimestamp(value.updated_at)
  ) {
    throw new Error("Invalid product catalog response")
  }

  const colors = parseStringArray(value.colors, 30, 80)
  const highlights = parseStringArray(value.highlights, 50, 500)
  const details = parseDetails(value.details)
  const sections = parseSections(value.sections)
  const imagePath = value.image_path

  return {
    id: value.id,
    status: value.status,
    title: value.title,
    image: publicImageUrl(imagePath, supabaseUrl),
    imagePath,
    originalPrice: value.original_price_cents / 100,
    discountPrice: value.price_cents / 100,
    tag: value.tag,
    category: value.category,
    colors,
    featured: value.featured,
    ...(value.notice === null ? {} : { notice: value.notice }),
    highlights,
    description: value.description,
    details,
    sections,
    shipping: {
      weightKg: value.shipping_weight_kg,
      lengthCm: value.shipping_length_cm,
      widthCm: value.shipping_width_cm,
      heightCm: value.shipping_height_cm,
    },
    displayOrder: value.display_order,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}
