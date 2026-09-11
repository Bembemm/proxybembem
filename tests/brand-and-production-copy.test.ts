import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const navbarSource = readFileSync(new URL("../components/navbar.tsx", import.meta.url), "utf8")
const footerSource = readFileSync(new URL("../components/footer.tsx", import.meta.url), "utf8")
const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")
const brandRouteSource = readFileSync(new URL("../app/brand/pb/route.ts", import.meta.url), "utf8")
const faqSource = readFileSync(new URL("../components/faq-section.tsx", import.meta.url), "utf8")

test("shared PB brand mark uses an extensionless route with a direct PNG response", () => {
  assert.match(brandRouteSource, /Content-Type["']?:\s*["']image\/png/i)
  assert.match(brandRouteSource, /Buffer\.from\([^,]+,\s*["']base64["']\)/)
  assert.match(navbarSource, /src="\/brand\/pb"/)
  assert.match(footerSource, /src="\/brand\/pb"/)
  assert.match(layoutSource, /icon:\s*"\/brand\/pb"/)
  assert.match(layoutSource, /apple:\s*"\/brand\/pb"/)
  assert.equal(navbarSource.includes("/brand/pb.png"), false)
  assert.equal(footerSource.includes("/brand/pb.png"), false)
  assert.equal(layoutSource.includes("/brand/pb.png"), false)
  assert.equal(navbarSource.includes("/icon.svg"), false)
  assert.equal(footerSource.includes("/icon.svg"), false)
})

test("customer-facing production copy consistently says up to five business days", () => {
  assert.match(faqSource, /produção é de até 5 dias úteis/i)
  assert.equal(/1 a 3 dias úteis/i.test(faqSource), false)
  assert.equal(/pagamento via Pix/i.test(faqSource), false)
})
