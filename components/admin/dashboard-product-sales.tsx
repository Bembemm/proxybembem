import { PackageCheck } from "lucide-react"
import type { DashboardProductSale } from "../../lib/server/admin-dashboard.ts"

export function DashboardProductSales({
  products,
}: {
  products: DashboardProductSale[]
}) {
  return (
    <section
      aria-labelledby="dashboard-products-title"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <PackageCheck className="size-4.5 text-violet-700" aria-hidden="true" />
          <h2 id="dashboard-products-title" className="font-semibold text-slate-950">
            Produtos vendidos no mês
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Quantidades de pedidos aprovados, preservando o snapshot histórico da compra.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="font-medium text-slate-800">Nenhuma venda aprovada neste mês.</p>
          <p className="mt-1 text-sm text-slate-500">A lista aparece após uma aprovação confiável de pagamento.</p>
        </div>
      ) : (
        <ol className="divide-y divide-slate-200">
          {products.map((product, index) => (
            <li key={product.productId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-sm font-bold tabular-nums text-violet-700">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{product.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">Produto #{product.productId}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums text-slate-950">{product.quantity}</p>
                <p className="text-xs text-slate-500">unidades</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
