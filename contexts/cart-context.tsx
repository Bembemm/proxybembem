"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export interface ProductDetail {
  label: string
  value: string
}

export interface ProductSection {
  title: string
  paragraphs: string[]
}

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
  notice?: string
  description: string
  details: ProductDetail[]
  sections: ProductSection[]
}

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

function isStoredCart(value: unknown): value is CartItem[] {
  if (!Array.isArray(value)) return false

  return value.every((item) => {
    if (!item || typeof item !== "object") return false

    const cartItem = item as Partial<CartItem>
    return (
      Number.isInteger(cartItem.quantity) &&
      Number(cartItem.quantity) > 0 &&
      !!cartItem.product &&
      typeof cartItem.product.id === "number" &&
      typeof cartItem.product.title === "string" &&
      typeof cartItem.product.discountPrice === "number"
    )
  })
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
      if (storedCart) {
        const parsedCart: unknown = JSON.parse(storedCart)
        if (isStoredCart(parsedCart)) {
          setItems(parsedCart)
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
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
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

  const clearCart = () => {
    setItems([])
  }

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
