import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const iconSource = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8")
const navbarSource = readFileSync(new URL("../components/navbar.tsx", import.meta.url), "utf8")
const footerSource = readFileSync(new URL("../components/footer.tsx", import.meta.url), "utf8")
const faqSource = readFileSync(new URL("../components/faq-section.tsx", import.meta.url), "utf8")

test("site uses the ProxyBembem PB artwork for its shared brand mark", () => {
  assert.match(iconSource, /<title>ProxyBembem PB<\/title>/)
  assert.match(iconSource, /data:image\/png;base64,/)
  assert.match(navbarSource, /src="\/icon\.svg"/)
  assert.match(footerSource, /src="\/icon\.svg"/)
})

test("customer-facing production copy consistently says up to five business days", () => {
  assert.match(faqSource, /produção é de até 5 dias úteis/i)
  assert.equal(/1 a 3 dias úteis/i.test(faqSource), false)
  assert.equal(/pagamento via Pix/i.test(faqSource), false)
})
