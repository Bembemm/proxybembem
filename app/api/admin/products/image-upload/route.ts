import { authorizeAdminAccess } from "../../../../../lib/server/admin-auth.ts"
import {
  createProductImageUploadHandler,
  createSignedProductImageUpload,
} from "../../../../../lib/server/product-images.ts"

export const runtime = "nodejs"

export const POST = createProductImageUploadHandler({
  authorizeAdmin: () => authorizeAdminAccess({ touch: true }),
  issueSignedUpload: (metadata) => createSignedProductImageUpload(metadata),
})
