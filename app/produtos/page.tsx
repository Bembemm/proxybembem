import type { Metadata } from "next"
import { ProductsPage } from "@/components/pages/products-page"

export const metadata: Metadata = {
  title: "Produtos",
  description: "Veja os decks, cartas avulsas e proxies disponíveis na ProxyBembem.",
}

export default function ProdutosPage() {
  return <ProductsPage />
}
