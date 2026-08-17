import type { Product } from "@/types/commerce"

export const products: Product[] = [
  {
    id: 1,
    title: "Deck Commander Proxy 100 Cartas",
    image: "/products/deck-commander.png",
    originalPrice: 150,
    discountPrice: 119.9,
    tag: "Mais Vendido",
    category: "Decks",
    colors: ["Azul", "Preto"],
    featured: true,
  },
]

export const featuredProducts = products.filter((product) => product.featured)

export const productCategories = Array.from(
  new Set(products.map((product) => product.category)),
)

export function getProductById(productId: number) {
  return products.find((product) => product.id === productId)
}
