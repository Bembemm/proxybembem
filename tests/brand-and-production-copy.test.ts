import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const navbarSource = readFileSync(new URL("../components/navbar.tsx", import.meta.url), "utf8")
const footerSource = readFileSync(new URL("../components/footer.tsx", import.meta.url), "utf8")
const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")
const brandRouteSource = readFileSync(new URL("../app/brand/pb.png/route.ts", import.meta.url), "utf8")
const faqSource = readFileSync(new URL("../components/faq-section.tsx", import.meta.url), "utf8")

test("shared PB brand mark uses a direct PNG response instead of raster inside SVG", () => {
  assert.match(brandRouteSource, /Content-Type["']?:\s*["']image\/png/i)
  assert.match(brandRouteSource, /Buffer\.from\([^,]+,\s*["']base64["']\)/)
  assert.match(navbarSource, /src="\/brand\/pb\.png"/)
  assert.match(footerSource, /src="\/brand\/pb\.png"/)
  assert.match(layoutSource, /icon:\s*"\/brand\/pb\.png"/)
  assert.match(layoutSource, /apple:\s*"\/brand\/pb\.png"/)
  assert.equal(navbarSource.includes("/icon.svg"), false)
  assert.equal(footerSource.includes("/icon.svg"), false)
})

test("customer-facing production copy consistently says up to five business days", () => {
  assert.match(faqSource, /produção é de até 5 dias úteis/i)
  assert.equal(/1 a 3 dias úteis/i.test(faqSource), false)
  assert.equal(/pagamento via Pix/i.test(faqSource), false)
})
