import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"
import { AdminShell } from "../../../../components/admin/admin-shell.tsx"
import { ProductForm } from "../../../../components/admin/products/product-form.tsx"
import { requireAdminPageAccess } from "../../../../lib/server/admin-auth.ts"
import { getAdminProduct } from "../../../../lib/server/product-catalog.ts"

type PageParams = Promise<{ id: string }>

export const dynamic = "force-dynamic"

function parseProductId(value: string) {
  if (!/^\d{1,15}$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export default async function EditAdminProductPage({
  params,
}: {
  params: PageParams
}) {
  await requireAdminPageAccess({ touch: true })

  const { id: rawId } = await params
  const id = parseProductId(rawId)
  if (id === null) notFound()

  const product = await getAdminProduct(id)
  if (!product) notFound()

  return (
    <AdminShell
      activeSection="products"
      title={`Editar: ${product.title}`}
      description="Atualize o catálogo com salvamento explícito e controle de publicação."
    >
      <div className="min-w-0 space-y-5">
        <a
          href="/admin/produtos"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-violet-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para produtos
        </a>
        <ProductForm product={product} />
      </div>
    </AdminShell>
  )
}
