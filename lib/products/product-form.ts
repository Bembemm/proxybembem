export interface ProductMutationInput {
  title: string
  category: string
  tag: string | null
  featured: boolean
  imagePath: string
  originalPriceCents: number
  priceCents: number
  description: string
  notice: string | null
  colors: string[]
  highlights: string[]
  details: Array<{ label: string; value: string }>
  sections: Array<{ title: string; paragraphs: string[] }>
  shipping: {
    weightKg: number
    lengthCm: number
    widthCm: number
    heightCm: number
  }
  displayOrder: number
}

export type ProductFieldErrors = Record<string, string>

export type ProductMutationValidationResult =
  | { ok: true; value: ProductMutationInput }
  | { ok: false; fieldErrors: ProductFieldErrors }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function boundedString(
  value: unknown,
  key: string,
  min: number,
  max: number,
  errors: ProductFieldErrors,
) {
  if (typeof value !== "string") {
    errors[key] = "Campo inválido."
    return ""
  }

  const normalized = value.trim()
  if (normalized.length < min || normalized.length > max) {
    errors[key] = "Campo inválido."
  }
  return normalized
}

function nullableString(
  value: unknown,
  key: string,
  max: number,
  errors: ProductFieldErrors,
) {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") {
    errors[key] = "Campo inválido."
    return null
  }

  const normalized = value.trim()
  if (normalized.length === 0) return null
  if (normalized.length > max) errors[key] = "Campo inválido."
  return normalized
}

function positiveSafeInteger(
  value: unknown,
  key: string,
  errors: ProductFieldErrors,
) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    errors[key] = "Informe um valor positivo."
    return 0
  }
  return value
}

function nonnegativeSafeInteger(
  value: unknown,
  key: string,
  errors: ProductFieldErrors,
) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    errors[key] = "Informe um número inteiro válido."
    return 0
  }
  return value
}

function positiveNumber(
  value: unknown,
  key: string,
  errors: ProductFieldErrors,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors[key] = "Informe um valor positivo."
    return 0
  }
  return value
}

function stringArray(
  value: unknown,
  key: string,
  maxItems: number,
  maxLength: number,
  errors: ProductFieldErrors,
) {
  if (!Array.isArray(value)) {
    errors[key] = "Lista inválida."
    return [] as string[]
  }
  if (value.length > maxItems) errors[key] = "Lista muito longa."

  return value.slice(0, maxItems).map((item, index) =>
    boundedString(item, `${key}.${index}`, 1, maxLength, errors),
  )
}

function detailsArray(value: unknown, errors: ProductFieldErrors) {
  if (!Array.isArray(value)) {
    errors.details = "Lista inválida."
    return [] as ProductMutationInput["details"]
  }
  if (value.length > 50) errors.details = "Lista muito longa."

  return value.slice(0, 50).map((item, index) => {
    if (!isRecord(item)) {
      errors[`details.${index}`] = "Detalhe inválido."
      return { label: "", value: "" }
    }
    return {
      label: boundedString(item.label, `details.${index}.label`, 1, 160, errors),
      value: boundedString(item.value, `details.${index}.value`, 1, 3000, errors),
    }
  })
}

function sectionsArray(value: unknown, errors: ProductFieldErrors) {
  if (!Array.isArray(value)) {
    errors.sections = "Lista inválida."
    return [] as ProductMutationInput["sections"]
  }
  if (value.length > 30) errors.sections = "Lista muito longa."

  return value.slice(0, 30).map((item, index) => {
    if (!isRecord(item)) {
      errors[`sections.${index}`] = "Seção inválida."
      return { title: "", paragraphs: [] }
    }
    return {
      title: boundedString(item.title, `sections.${index}.title`, 1, 160, errors),
      paragraphs: stringArray(
        item.paragraphs,
        `sections.${index}.paragraphs`,
        30,
        5000,
        errors,
      ),
    }
  })
}

function imagePath(
  value: unknown,
  errors: ProductFieldErrors,
) {
  const normalized = boundedString(value, "imagePath", 1, 500, errors)
  if (
    normalized.includes("..") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    errors.imagePath = "Caminho de imagem inválido."
  }
  return normalized
}

export function validateProductMutationInput(
  value: unknown,
): ProductMutationValidationResult {
  const errors: ProductFieldErrors = {}
  if (!isRecord(value)) {
    return { ok: false, fieldErrors: { _form: "Dados do produto inválidos." } }
  }

  const shippingValue = isRecord(value.shipping) ? value.shipping : {}
  if (!isRecord(value.shipping)) errors.shipping = "Dados de frete inválidos."

  const normalized: ProductMutationInput = {
    title: boundedString(value.title, "title", 1, 160, errors),
    category: boundedString(value.category, "category", 1, 80, errors),
    tag: nullableString(value.tag, "tag", 80, errors),
    featured:
      typeof value.featured === "boolean"
        ? value.featured
        : (errors.featured = "Campo inválido.", false),
    imagePath: imagePath(value.imagePath, errors),
    originalPriceCents: positiveSafeInteger(
      value.originalPriceCents,
      "originalPriceCents",
      errors,
    ),
    priceCents: positiveSafeInteger(value.priceCents, "priceCents", errors),
    description: boundedString(value.description, "description", 1, 5000, errors),
    notice: nullableString(value.notice, "notice", 500, errors),
    colors: stringArray(value.colors, "colors", 30, 80, errors),
    highlights: stringArray(value.highlights, "highlights", 50, 500, errors),
    details: detailsArray(value.details, errors),
    sections: sectionsArray(value.sections, errors),
    shipping: {
      weightKg: positiveNumber(shippingValue.weightKg, "shipping.weightKg", errors),
      lengthCm: positiveNumber(shippingValue.lengthCm, "shipping.lengthCm", errors),
      widthCm: positiveNumber(shippingValue.widthCm, "shipping.widthCm", errors),
      heightCm: positiveNumber(shippingValue.heightCm, "shipping.heightCm", errors),
    },
    displayOrder: nonnegativeSafeInteger(value.displayOrder, "displayOrder", errors),
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors }
  return { ok: true, value: normalized }
}
