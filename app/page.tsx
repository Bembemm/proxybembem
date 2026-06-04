"use client"

import { useState, useEffect } from "react"
import { Navbar } from "@/components/navbar"
import { HomePage } from "@/components/pages/home-page"
import { ProductsPage } from "@/components/pages/products-page"
import { ContactPage } from "@/components/pages/contact-page"
import { Footer } from "@/components/footer"
import { FaqSection } from "@/components/faq-section"
import { CartFloatingButton } from "@/components/whatsapp-button"
import { CartPanel } from "@/components/cart-panel"
import { AnimatedBackground } from "@/components/animated-background"
import { CartProvider } from "@/contexts/cart-context"

export type PageType = "inicio" | "produtos" | "contato"

export default function Home() {
  const [currentPage, setCurrentPage] = useState<PageType>("inicio")

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [currentPage])

  return (
    <CartProvider>
      <main className="min-h-screen relative w-full overflow-x-hidden">
        <AnimatedBackground />
        <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />
        
        {currentPage === "inicio" && <HomePage setCurrentPage={setCurrentPage} />}
        {currentPage === "produtos" && <ProductsPage />}
        {currentPage === "contato" && <ContactPage />}
        
        <FaqSection />
        <Footer />
        <CartFloatingButton />
        <CartPanel />
      </main>
    </CartProvider>
  )
}
