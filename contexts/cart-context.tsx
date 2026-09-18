"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  parseStoredCart,
  reconcileStoredCartWithCatalog,
  serializeCart,
  type StoredCartLine,
} from "@/lib/cart-storage"
import type { StorefrontProduct } from "@/lib/products/product"

export type {
  Product,
  ProductDetail,
  ProductSection,
  ProductShipping,
  StorefrontProduct,
} from "@/lib/products/product"

export interface CartItem {
  product: StorefrontProduct
  quantity: number
}

type CatalogStatus = "idle" | "loading" | "ready" | "unavailable"

interface CartContextType {
  items: CartItem[]
  addToCart: (product: StorefrontProduct) => void
  removeFromCart: (productId: number) => void
  updateQuantity: (productId: number, quantity: number) => void
  clearCart: () => void
  totalItems: number
  totalPrice: number
  isCartOpen: boolean
  setIsCartOpen: (open: boolean) => void
  catalogStatus: CatalogStatus
  ensureCatalog: () => Promise<void>
  retryCatalog: () => void
  cartNotice: string | null
  dismissCartNotice: () => void
  catalogProducts: StorefrontProduct[]
}

interface CatalogResponse {
  products?: unknown
}

const CART_STORAGE_KEY = "proxybembem-cart-v1"
const CartContext = createContext<CartContextType | undefined>(undefined)

function parseCatalogProducts(value: unknown): StorefrontProduct[] | null {
  if (!value || typeof value !== "object") return null

  const products = (value as CatalogResponse).products
  if (!Array.isArray(products)) return null

  for (const entry of products) {
    if (!entry || typeof entry !== "object") return null
    const candidate = entry as Partial<StorefrontProduct>
    if (
      !Number.isSafeInteger(candidate.id) ||
      (candidate.id ?? 0) <= 0 ||
      typeof candidate.title !== "string" ||
      !candidate.title ||
      typeof candidate.image !== "string" ||
      !candidate.image ||
      typeof candidate.category !== "string" ||
      !candidate.category ||
      typeof candidate.originalPrice !== "number" ||
      !Number.isFinite(candidate.originalPrice) ||
      candidate.originalPrice < 0 ||
      typeof candidate.discountPrice !== "number" ||
      !Number.isFinite(candidate.discountPrice) ||
      candidate.discountPrice < 0
    ) {
      return null
    }
  }

  return products as StorefrontProduct[]
}

function mergeHydratedItems(restoredItems: CartItem[], currentItems: CartItem[]): CartItem[] {
  const itemsById = new Map<number, CartItem>()

  for (const item of restoredItems) {
    itemsById.set(item.product.id, item)
  }

  for (const item of currentItems) {
    const restored = itemsById.get(item.product.id)
    itemsById.set(
      item.product.id,
      restored
        ? {
            product: item.product,
            quantity: restored.quantity + item.quantity,
          }
        : item,
    )
  }

  return Array.from(itemsById.values())
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("idle")
  const [cartNotice, setCartNotice] = useState<string | null>(null)
  const [catalogProducts, setCatalogProducts] = useState<StorefrontProduct[]>([])
  const storedLinesRef = useRef<StoredCartLine[] | null>(null)
  const hasReadStoredCartRef = useRef(false)
  const catalogRequestRef = useRef<Promise<void> | null>(null)

  const ensureCatalog = useCallback(async () => {
    if (catalogStatus === "ready") return
    if (catalogRequestRef.current) return catalogRequestRef.current

    const request = (async () => {
      setCatalogStatus("loading")

      try {
        const response = await fetch("/api/catalog", { cache: "no-store" })
        if (!response.ok) throw new Error("Catalog unavailable")

        const catalog = parseCatalogProducts(await response.json().catch(() => null))
        if (!catalog) throw new Error("Invalid catalog response")

        const storedLines = storedLinesRef.current ?? []
        const reconciliation = reconcileStoredCartWithCatalog(storedLines, catalog)

        setCatalogProducts(catalog)
        setItems((currentItems) => mergeHydratedItems(reconciliation.items, currentItems))
        if (reconciliation.removedCount > 0) {
          setCartNotice("Um produto do seu carrinho não está mais disponível.")
        }
        setCatalogStatus("ready")
      } catch {
        setCatalogStatus("unavailable")
      } finally {
        catalogRequestRef.current = null
      }
    })()

    catalogRequestRef.current = request
    return request
  }, [catalogStatus])

  useEffect(() => {
    if (hasReadStoredCartRef.current) return
    hasReadStoredCartRef.current = true

    let storedLines: StoredCartLine[] = []

    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
      if (storedCart) {
        const parsedCart = parseStoredCart(JSON.parse(storedCart))
        if (parsedCart) {
          storedLines = parsedCart
        } else {
          window.localStorage.removeItem(CART_STORAGE_KEY)
        }
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    }

    storedLinesRef.current = storedLines
    if (storedLines.length > 0) {
      void ensureCatalog()
    }
  }, [ensureCatalog])

  useEffect(() => {
    if (catalogStatus !== "ready") return
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(serializeCart(items)))
  }, [items, catalogStatus])

  const retryCatalog = () => {
    catalogRequestRef.current = null
    void ensureCatalog()
  }

  const dismissCartNotice = () => setCartNotice(null)

  const addToCart = (product: StorefrontProduct) => {
    void ensureCatalog()
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
        catalogStatus,
        ensureCatalog,
        retryCatalog,
        cartNotice,
        dismissCartNotice,
        catalogProducts,
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
