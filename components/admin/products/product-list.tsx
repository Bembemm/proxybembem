import type { CatalogProduct, ProductStatus } from "../../../lib/products/product.ts"

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
}

const STATUS_TONES: Record<ProductStatus, string> = {
  draft: "bg-amber-50 text-amber-800 ring-amber-200",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  archived: "bg-slate-100 text-slate-700 ring-slate-200",
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_TONES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function ProductThumbnail({ product }: { product: CatalogProduct }) {
  return (
    <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <img
        src={product.image}
        alt=""
        width={56}
        height={56}
        loading="lazy"
        className="size-full object-cover"
      />
    </div>
  )
}

export function ProductList({ products }: { products: CatalogProduct[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
        <p className="font-medium text-slate-800">Nenhum produto encontrado.</p>
        <p className="mt-1 text-sm text-slate-500">
          Ajuste a busca ou o filtro de status para continuar.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-3 md:hidden" role="list">
        {products.map((product) => (
          <article
            key={product.id}
            role="listitem"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex min-w-0 gap-3">
              <ProductThumbnail product={product} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-950">{product.title}</p>
                <p className="mt-1 text-sm text-slate-500">{product.category}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ProductStatusBadge status={product.status} />
                  {product.featured ? (
                    <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                      Destaque
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Preço</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatMoney(product.discountPrice)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Atualizado</dt>
                <dd className="mt-1 text-slate-700">{formatUpdatedAt(product.updatedAt)}</dd>
              </div>
            </dl>

            <a
              href={`/admin/produtos/${product.id}`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              Editar
            </a>
          </article>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Produto</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Preço</th>
              <th className="px-4 py-3 font-semibold">Categoria</th>
              <th className="px-4 py-3 font-semibold">Destaque</th>
              <th className="px-4 py-3 font-semibold">Atualizado</th>
              <th className="px-4 py-3 text-right font-semibold">Editar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {products.map((product) => (
              <tr key={product.id} className="align-middle">
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductThumbnail product={product} />
                    <span className="max-w-64 truncate font-semibold text-slate-950">
                      {product.title}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ProductStatusBadge status={product.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                  {formatMoney(product.discountPrice)}
                </td>
                <td className="px-4 py-3 text-slate-700">{product.category}</td>
                <td className="px-4 py-3 text-slate-700">
                  {product.featured ? "Sim" : "Não"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatUpdatedAt(product.updatedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={`/admin/produtos/${product.id}`}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  >
                    Editar
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
