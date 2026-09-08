"use client"

import { Archive, Loader2, RotateCcw, Send } from "lucide-react"
import { useState } from "react"
import type { CatalogProduct, ProductStatus } from "../../../lib/products/product.ts"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog.tsx"

const CONFLICT_MESSAGE = "Este produto foi alterado em outra sessão. Recarregue antes de salvar."

const lifecycleRoutes = {
  publish: "/publish",
  archive: "/archive",
  reactivate: "/reactivate",
} as const

type LifecycleOperation = keyof typeof lifecycleRoutes

interface ProductLifecycleActionsProps {
  productId: number
  status: ProductStatus
  expectedUpdatedAt: string
  disabled?: boolean
  onUpdated(product: CatalogProduct): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function ProductLifecycleActions({
  productId,
  status,
  expectedUpdatedAt,
  disabled = false,
  onUpdated,
}: ProductLifecycleActionsProps) {
  const [pending, setPending] = useState<LifecycleOperation | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(operation: LifecycleOperation) {
    if (pending || disabled) return
    setPending(operation)
    setError(null)
    try {
      const response = await fetch(
        `/api/admin/products/${productId}${lifecycleRoutes[operation]}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedUpdatedAt }),
        },
      )
      const payload = (await response.json().catch(() => null)) as unknown
      if (response.status === 409 && isRecord(payload) && payload.error === "product_conflict") {
        setError(CONFLICT_MESSAGE)
        return
      }
      if (!response.ok || !isRecord(payload) || !isRecord(payload.product)) {
        setError("Não foi possível atualizar a publicação do produto.")
        return
      }
      onUpdated(payload.product as unknown as CatalogProduct)
      if (operation === "archive") setArchiveOpen(false)
    } catch {
      setError("Não foi possível atualizar a publicação do produto.")
    } finally {
      setPending(null)
    }
  }

  const busy = pending !== null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => run("publish")}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === "publish" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            Publicar
          </button>
        ) : null}

        {status === "draft" || status === "published" ? (
          <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                disabled={disabled || busy}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Archive className="size-4" aria-hidden="true" />
                Arquivar
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Arquivar produto</DialogTitle>
                <DialogDescription>
                  O produto deixará de aparecer na loja. Ele não será apagado e poderá ser reativado como rascunho.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                    Cancelar
                  </button>
                </DialogClose>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run("archive")}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {pending === "archive" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Confirmar arquivamento
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        {status === "archived" ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => run("reactivate")}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === "reactivate" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
            Reativar
          </button>
        ) : null}
      </div>
      {disabled ? <p className="text-xs text-amber-700">Salve as alterações pendentes antes de mudar o status.</p> : null}
      {error ? <p role="alert" className="text-sm font-medium text-rose-600">{error}</p> : null}
    </div>
  )
}
