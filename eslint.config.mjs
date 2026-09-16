import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
    },
  },
  {
    files: ["app.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: [
      "components/navbar.tsx",
      "app/admin/pedidos/**/page.tsx",
      "app/admin/produtos/**/page.tsx",
      "components/admin/dashboard-attention-center.tsx",
    ],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: [
      "app/admin/login/login-form.tsx",
      "app/admin/mfa/mfa-form.tsx",
      "app/admin/setup-mfa/setup-mfa-form.tsx",
      "components/account/password-form.tsx",
      "components/cart-panel.tsx",
      "components/checkout-page.tsx",
    ],
    rules: {
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  {
    files: [
      "app/admin/setup-mfa/setup-mfa-form.tsx",
      "components/admin/products/product-list.tsx",
      "components/checkout-page.tsx",
      "components/footer.tsx",
      "components/navbar.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
])
