import { Plus, Search } from "lucide-react"
import { AdminShell } from "../../../components/admin/admin-shell.tsx"
import { ProductList } from "../../../components/admin/products/product-list.tsx"
import {
  isProductStatus,
  type ProductStatus,
} from "../../../lib/products/product.ts"
import { requireAdminPageAccess } from "../../../lib/server/admin-auth.ts"
import { listAdminProducts } from "../../../lib/server/product-catalog.ts"

const PAGE_SIZE = 25
const MAX_PAGE = 401

type PageSearchParams = Promise<{
  q?: string | string[]
  status?: string | string[]
  page?: string | string[]
}>

type NormalizedFilters = {
  query?: string
  status?: ProductStatus
  page: number
}

export const dynamic = "force-dynamic"

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parsePage(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE
    ? parsed
    : 1
}

function normalizeFilters(params: Awaited<PageSearchParams>): NormalizedFilters {
  const rawQuery = firstParam(params.q)?.trim() ?? ""
  const query = rawQuery ? rawQuery.slice(0, 100) : undefined
  const rawStatus = firstParam(params.status)
  const status = rawStatus && isProductStatus(rawStatus) ? rawStatus : undefined

  return {
    query,
    status,
    page: parsePage(firstParam(params.page)),
  }
}

function buildPageHref(filters: NormalizedFilters, page: number) {
  const search = new URLSearchParams()
  if (filters.query) search.set("q", filters.query)
  if (filters.status) search.set("status", filters.status)
  search.set("page", String(page))
  return `/admin/produtos?${search.toString()}`
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: PageSearchParams
}) {
  await requireAdminPageAccess({ touch: true })

  const params = await searchParams
  const filters = normalizeFilters(params)
  const result = await listAdminProducts({
    query: filters.query,
    status: filters.status,
    page: filters.page,
    pageSize: 25,
  })

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  const hasPrevious = result.page > 1
  const hasNext = result.page < totalPages

  return (
    <AdminShell
      activeSection="products"
      title="Produtos"
      description="Gerencie o catálogo da loja, acompanhe o status de publicação e abra cada produto para edição."
    >
      <div className="min-w-0 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Catálogo</h2>
            <p className="mt-1 text-sm text-slate-500">
              {result.total} {result.total === 1 ? "produto encontrado" : "produtos encontrados"}
            </p>
          </div>
          <a
            href="/admin/produtos/novo"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition sm:w-auto bg-violet-600 hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            <Plus className="size-4" aria-hidden="true" />
            Novo produto
          </a>
        </div>

        <form method="get" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_auto] xl:items-end">
            <label className="sm:col-span-2 xl:col-span-1">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Buscar
              </span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  name="q"
                  type="search"
                  maxLength={100}
                  defaultValue={filters.query ?? ""}
                  placeholder="Título do produto"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Status
              </span>
              <select
                name="status"
                defaultValue={filters.status ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              >
                <option value="">Todos</option>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
                <option value="archived">Arquivado</option>
              </select>
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:flex-none"
              >
                Filtrar
              </button>
              <a
                href="/admin/produtos"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Limpar
              </a>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Página {result.page} de {totalPages}
          </p>
        </div>

        <ProductList products={result.products} />

        <nav
          aria-label="Paginação dos produtos"
          className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5"
        >
          {hasPrevious ? (
            <a
              href={buildPageHref(filters, result.page - 1)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
            >
              Anterior
            </a>
          ) : (
            <span className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
              Anterior
            </span>
          )}

          {hasNext ? (
            <a
              href={buildPageHref(filters, result.page + 1)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
            >
              Próxima
            </a>
          ) : (
            <span className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
              Próxima
            </span>
          )}
        </nav>
      </div>
    </AdminShell>
  )
}
