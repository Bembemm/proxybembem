"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { products } from "@/data/products"
import { parseStoredCart, serializeCart } from "@/lib/cart-storage"
import type { Product } from "@/lib/products/product"

export type {
  Product,
  ProductDetail,
  ProductSection,
  ProductShipping,
} from "@/lib/products/product"

export interface CartItem {
  product: Product
  quantity: number
}

interface CartContextType {
  items: CartItem[]
  addToCart: (product: Product) => void
  removeFromCart: (productId: number) => void
  updateQuantity: (productId: number, quantity: number) => void
  clearCart: () => void
  totalItems: number
  totalPrice: number
  isCartOpen: boolean
  setIsCartOpen: (open: boolean) => void
}

const CART_STORAGE_KEY = "proxybembem-cart-v1"
const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
      if (storedCart) {
        const parsedCart = parseStoredCart(JSON.parse(storedCart))
        if (parsedCart) {
          const restoredItems = parsedCart.flatMap((line) => {
            const product = products.find((candidate) => candidate.id === line.productId)
            return product ? [{ product, quantity: line.quantity }] : []
          })
          setItems(restoredItems)
        } else {
          window.localStorage.removeItem(CART_STORAGE_KEY)
        }
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    } finally {
      setIsHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(serializeCart(items)))
  }, [items, isHydrated])

  const addToCart = (product: Product) => {
    setItems((previousItems) => {
      const existingItem = previousItems.find((item) => item.product.id === product.id)
      if (existingItem) {
        return previousItems.map((item) =>
          item.product.id === product.id
            ? { ...item, product, quantity: item.quantity + 1 }
            : item,
        )
      }
      return [...previousItems, { product, quantity: 1 }]
    })
  }

  const removeFromCart = (productId: number) => {
    setItems((previousItems) => previousItems.filter((item) => item.product.id !== productId))
  }

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }

    setItems((previousItems) =>
      previousItems.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item,
      ),
    )
  }

  const clearCart = () => setItems([])

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce(
    (sum, item) => sum + item.product.discountPrice * item.quantity,
    0,
  )

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return context
}
