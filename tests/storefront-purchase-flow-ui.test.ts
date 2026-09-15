import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("floating action is WhatsApp contact instead of the cart", () => {
  const floating = source("components/whatsapp-button.tsx")
  const shell = source("components/site-shell.tsx")

  assert.match(floating, /WhatsAppFloatingButton/)
  assert.match(floating, /contactWhatsappE164/)
  assert.match(floating, /https:\/\/wa\.me\//)
  assert.match(floating, /bg-\[#25D366\]/)
  assert.doesNotMatch(floating, /setIsCartOpen\(true\)/)
  assert.doesNotMatch(floating, /ShoppingCart/)
  assert.match(shell, /WhatsAppFloatingButton/)
  assert.match(shell, /contactWhatsappE164=\{storeSettings\.contactWhatsappE164\}/)
})

test("cart panel is a light cart and freight preview that continues to a dedicated checkout page", () => {
  const cart = source("components/cart-panel.tsx")

  assert.match(cart, /Carrinho de compras/)
  assert.match(cart, /Meios de envio/)
  assert.match(cart, /Subtotal(?: \(sem frete\))?/) 
  assert.match(cart, />Frete:</)
  assert.match(cart, />Total:</)
  assert.match(cart, /Iniciar compra/)
  assert.match(cart, /\/api\/shipping\/quote/)
  assert.match(cart, /window\.location\.assign\(["']\/checkout["']\)/)
  assert.doesNotMatch(cart, /CheckoutForm/)
  assert.doesNotMatch(cart, /OrderSummary/)
  assert.doesNotMatch(cart, /fetch\(["']\/api\/checkout["']/)
})

test("checkout is a dedicated page with delivery form, order summary, secure payment redirect and three-step progress", () => {
  const pagePath = new URL("../app/checkout/page.tsx", import.meta.url)
  const componentPath = new URL("../components/checkout-page.tsx", import.meta.url)

  assert.equal(existsSync(pagePath), true, "app/checkout/page.tsx should exist")
  assert.equal(existsSync(componentPath), true, "components/checkout-page.tsx should exist")

  const page = readFileSync(pagePath, "utf8")
  const checkout = readFileSync(componentPath, "utf8")

  assert.match(page, /CheckoutPage/)
  assert.match(checkout, /CheckoutForm/)
  assert.match(checkout, /ShippingOptions/)
  assert.match(checkout, /OrderSummary/)
  assert.match(checkout, /Carrinho/)
  assert.match(checkout, /Entrega/)
  assert.match(checkout, /Pagamento/)
  assert.match(checkout, /fetch\(["']\/api\/checkout["']/)
  assert.match(checkout, /isAllowedMercadoPagoCheckoutUrl/)
  assert.match(checkout, /\/entrar\?next=%2Fcheckout/)
})

test("checkout route uses a focused shell instead of the regular storefront chrome", () => {
  const shell = source("components/site-shell.tsx")

  assert.match(shell, /isCheckoutRoute/)
  assert.match(shell, /pathname === ["']\/checkout["']/)
  assert.match(shell, /isCheckoutRoute[\s\S]*<CartProvider>[\s\S]*\{children\}[\s\S]*<\/CartProvider>/)
})
