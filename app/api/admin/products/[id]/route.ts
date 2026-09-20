import { authorizeAdminAccess } from "../../../../../lib/server/admin-auth.ts"
import { invalidatePublishedProductCatalog } from "../../../../../lib/server/product-catalog-cache.ts"
import { createAdminProductRouteHandlers } from "../../../../../lib/server/admin-product-actions.ts"
import {
  archiveProduct,
  createDraftProduct,
  publishProduct,
  reactivateProduct,
  updateProduct,
} from "../../../../../lib/server/admin-products.ts"

export const runtime = "nodejs"

const handlers = createAdminProductRouteHandlers({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  createDraftProduct,
  updateProduct,
  publishProduct,
  archiveProduct,
  reactivateProduct,
  invalidatePublicProductCatalog: invalidatePublishedProductCatalog,
})

export const PATCH = handlers.update
