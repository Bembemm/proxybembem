import type { Product } from "./product"

function slugifyProductTitle(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)

  return slug || "produto"
}

export function productHref(product: Pick<Product, "id" | "title">) {
  return "/produtos/" + product.id + "-" + slugifyProductTitle(product.title)
}

export function productIdFromRouteSegment(segment: string) {
  const match = /^(\d+)(?:-|$)/.exec(segment)
  if (!match) return null

  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
