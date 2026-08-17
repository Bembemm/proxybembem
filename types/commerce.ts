export interface Product {
  id: number
  title: string
  image: string
  originalPrice: number
  discountPrice: number
  tag: string | null
  category: string
  colors?: string[]
  featured?: boolean
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface CheckoutItemInput {
  productId: number
  quantity: number
}

export interface PricedCheckoutItem {
  productId: number
  title: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
}

export interface CheckoutQuote {
  currency: "BRL"
  items: PricedCheckoutItem[]
  subtotalCents: number
}
