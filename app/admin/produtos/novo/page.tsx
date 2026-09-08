import { ArrowLeft } from "lucide-react"
import { AdminShell } from "../../../../components/admin/admin-shell.tsx"
import { ProductForm } from "../../../../components/admin/products/product-form.tsx"
import { requireAdminPageAccess } from "../../../../lib/server/admin-auth.ts"

export const dynamic = "force-dynamic"

export default async function NewAdminProductPage() {
  await requireAdminPageAccess({ touch: true })

  return (
    <AdminShell
      activeSection="products"
      title="Novo produto"
      description="Cadastre o produto como rascunho, revise as informações e publique somente quando estiver pronto para a loja."
    >
      <div className="min-w-0 space-y-5">
        <a
          href="/admin/produtos"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-violet-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para produtos
        </a>
        <ProductForm />
      </div>
    </AdminShell>
  )
}
