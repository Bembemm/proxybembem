"use client"

import { Loader2, Save } from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import type { ProductMutationInput } from "../../../lib/products/product-form.ts"
import type { CatalogProduct, ProductDetail, ProductSection } from "../../../lib/products/product.ts"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../ui/accordion.tsx"
import { ProductImageField } from "./product-image-field.tsx"
import { ProductLifecycleActions } from "./product-lifecycle-actions.tsx"
import { RepeatableFields } from "./repeatable-fields.tsx"

const CONFLICT_MESSAGE = "Este produto foi alterado em outra sessão. Recarregue antes de salvar."
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

interface ProductFormProps {
  product?: CatalogProduct
}

interface EditorState {
  title: string
  category: string
  tag: string
  featured: boolean
  imagePath: string
  imagePreview?: string
  originalPrice: string
  price: string
  description: string
  notice: string
  colors: string
  highlights: string[]
  details: ProductDetail[]
  sections: ProductSection[]
  weightKg: string
  lengthCm: string
  widthCm: string
  heightCm: string
  displayOrder: string
}

function formatCurrency(cents: number) {
  return currencyFormatter.format(cents / 100)
}

function currencyToCents(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".")
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0
}

function positiveNumber(value: string) {
  const parsed = Number(value.trim().replace(",", "."))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function displayOrder(value: string) {
  if (!/^\d+$/.test(value.trim())) return -1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : -1
}

function initialState(product?: CatalogProduct): EditorState {
  return {
    title: product?.title ?? "",
    category: product?.category ?? "",
    tag: product?.tag ?? "",
    featured: product?.featured ?? false,
    imagePath: product?.imagePath ?? "",
    imagePreview: product?.image,
    originalPrice: formatCurrency(Math.round((product?.originalPrice ?? 0) * 100)),
    price: formatCurrency(Math.round((product?.discountPrice ?? 0) * 100)),
    description: product?.description ?? "",
    notice: product?.notice ?? "",
    colors: product?.colors?.join(", ") ?? "",
    highlights: [...(product?.highlights ?? [])],
    details: product?.details.map((item) => ({ ...item })) ?? [],
    sections: product?.sections.map((section) => ({
      title: section.title,
      paragraphs: [...section.paragraphs],
    })) ?? [],
    weightKg: product ? String(product.shipping.weightKg) : "0,1",
    lengthCm: product ? String(product.shipping.lengthCm) : "20",
    widthCm: product ? String(product.shipping.widthCm) : "15",
    heightCm: product ? String(product.shipping.heightCm) : "2",
    displayOrder: product ? String(product.displayOrder) : "0",
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function statusLabel(status: CatalogProduct["status"]) {
  if (status === "published") return "Publicado"
  if (status === "archived") return "Arquivado"
  return "Rascunho"
}

export function ProductForm({ product }: ProductFormProps) {
  const [values, setValues] = useState<EditorState>(() => initialState(product))
  const [currentProduct, setCurrentProduct] = useState<CatalogProduct | undefined>(product)
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(product?.updatedAt ?? "")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [dirty])

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setSuccess(null)
    setFormError(null)
  }

  const mutationInput = useMemo<ProductMutationInput>(() => ({
    title: values.title,
    category: values.category,
    tag: values.tag.trim() ? values.tag : null,
    featured: values.featured,
    imagePath: values.imagePath,
    originalPriceCents: currencyToCents(values.originalPrice),
    priceCents: currencyToCents(values.price),
    description: values.description,
    notice: values.notice.trim() ? values.notice : null,
    colors: values.colors.split(",").map((item) => item.trim()).filter(Boolean),
    highlights: values.highlights,
    details: values.details,
    sections: values.sections,
    shipping: {
      weightKg: positiveNumber(values.weightKg),
      lengthCm: positiveNumber(values.lengthCm),
      widthCm: positiveNumber(values.widthCm),
      heightCm: positiveNumber(values.heightCm),
    },
    displayOrder: displayOrder(values.displayOrder),
  }), [values])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFieldErrors({})
    setFormError(null)
    setSuccess(null)

    const editing = Boolean(currentProduct)
    const endpoint = editing
      ? `/api/admin/products/${currentProduct?.id}`
      : "/api/admin/products"
    const requestBody = editing
      ? { ...mutationInput, expectedUpdatedAt }
      : mutationInput

    try {
      const response = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })
      const payload = (await response.json().catch(() => null)) as unknown

      if (response.status === 409 && isRecord(payload) && payload.error === "product_conflict") {
        setFormError(CONFLICT_MESSAGE)
        return
      }
      if (response.status === 400 && isRecord(payload) && isRecord(payload.fieldErrors)) {
        const errors: Record<string, string> = {}
        for (const [key, value] of Object.entries(payload.fieldErrors)) {
          if (typeof value === "string") errors[key] = value
        }
        setFieldErrors(errors)
        setFormError("Revise os campos destacados antes de salvar.")
        return
      }
      if (!response.ok || !isRecord(payload) || !isRecord(payload.product)) {
        setFormError("Não foi possível salvar o produto.")
        return
      }

      const saved = payload.product as unknown as CatalogProduct
      setCurrentProduct(saved)
      setExpectedUpdatedAt(saved.updatedAt)
      setValues(initialState(saved))
      setDirty(false)
      setSuccess(editing ? "Alterações salvas." : "Produto criado como rascunho.")

      if (!editing) {
        window.history.replaceState(null, "", `/admin/produtos/${saved.id}`)
      }
    } catch {
      setFormError("Não foi possível salvar o produto.")
    } finally {
      setSaving(false)
    }
  }

  function lifecycleUpdated(updatedProduct: CatalogProduct) {
    setCurrentProduct(updatedProduct)
    setExpectedUpdatedAt(updatedProduct.updatedAt)
    setDirty(false)
    setSuccess(`Status atualizado para ${statusLabel(updatedProduct.status).toLowerCase()}.`)
    setFormError(null)
  }

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Informações básicas</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Título</span>
            <input value={values.title} maxLength={160} onChange={(event) => update("title", event.target.value)} className={inputClass} />
            {fieldErrors.title ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.title}</span> : null}
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Categoria</span>
            <input value={values.category} maxLength={80} onChange={(event) => update("category", event.target.value)} className={inputClass} />
            {fieldErrors.category ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.category}</span> : null}
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Tag</span>
            <input value={values.tag} maxLength={80} onChange={(event) => update("tag", event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Ordem de exibição</span>
            <input type="number" min="0" step="1" value={values.displayOrder} onChange={(event) => update("displayOrder", event.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={values.featured} onChange={(event) => update("featured", event.target.checked)} className="size-4 rounded border-slate-300 text-violet-600" />
            Produto em destaque
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Preços</h2>
        <p className="mt-1 text-xs text-slate-500">Valores exibidos em reais; o envio para a API usa centavos inteiros.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Preço original (R$)</span>
            <input type="text" inputMode="decimal" value={values.originalPrice} onChange={(event) => update("originalPrice", event.target.value)} onBlur={() => update("originalPrice", formatCurrency(currencyToCents(values.originalPrice)))} className={inputClass} />
            {fieldErrors.originalPriceCents ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.originalPriceCents}</span> : null}
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Preço atual (R$)</span>
            <input type="text" inputMode="decimal" value={values.price} onChange={(event) => update("price", event.target.value)} onBlur={() => update("price", formatCurrency(currencyToCents(values.price)))} className={inputClass} />
            {fieldErrors.priceCents ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.priceCents}</span> : null}
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Imagem</h2>
        <div className="mt-4">
          <ProductImageField
            imagePath={values.imagePath}
            previewUrl={values.imagePreview}
            disabled={saving}
            onChange={(path, previewUrl) => {
              setValues((current) => ({ ...current, imagePath: path, imagePreview: previewUrl }))
              setDirty(true)
              setSuccess(null)
            }}
          />
          {fieldErrors.imagePath ? <p className="mt-2 text-xs text-rose-600">{fieldErrors.imagePath}</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Descrição e conteúdo</h2>
        <div className="mt-4 space-y-4">
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Descrição</span>
            <textarea value={values.description} maxLength={5000} rows={5} onChange={(event) => update("description", event.target.value)} className={`${inputClass} resize-y`} />
            {fieldErrors.description ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.description}</span> : null}
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Aviso opcional</span>
            <textarea value={values.notice} maxLength={500} rows={2} onChange={(event) => update("notice", event.target.value)} className={`${inputClass} resize-y`} />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Cores</span>
            <input value={values.colors} onChange={(event) => update("colors", event.target.value)} placeholder="Ex.: branco, preto" className={inputClass} />
            <span className="mt-1 block text-xs text-slate-500">Separe as cores por vírgula.</span>
          </label>

          <RepeatableFields
            highlights={values.highlights}
            details={values.details}
            sections={values.sections}
            onHighlightsChange={(value) => update("highlights", value)}
            onDetailsChange={(value) => update("details", value)}
            onSectionsChange={(value) => update("sections", value)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <Accordion type="single" collapsible>
          <AccordionItem value="shipping" className="border-0">
            <AccordionTrigger className="py-0 text-base font-semibold text-slate-950 hover:no-underline">Frete e dimensões</AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label>
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Peso (kg)</span>
                  <input inputMode="decimal" value={values.weightKg} onChange={(event) => update("weightKg", event.target.value)} className={inputClass} />
                </label>
                <label>
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Comprimento (cm)</span>
                  <input inputMode="decimal" value={values.lengthCm} onChange={(event) => update("lengthCm", event.target.value)} className={inputClass} />
                </label>
                <label>
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Largura (cm)</span>
                  <input inputMode="decimal" value={values.widthCm} onChange={(event) => update("widthCm", event.target.value)} className={inputClass} />
                </label>
                <label>
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Altura (cm)</span>
                  <input inputMode="decimal" value={values.heightCm} onChange={(event) => update("heightCm", event.target.value)} className={inputClass} />
                </label>
              </div>
              {Object.entries(fieldErrors).some(([key]) => key.startsWith("shipping.")) ? <p className="mt-3 text-xs text-rose-600">Revise peso e dimensões: todos devem ser maiores que zero.</p> : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Publicação</h2>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-700">
              Status: <strong>{currentProduct ? statusLabel(currentProduct.status) : "Novo rascunho"}</strong>
            </p>
            <p className="mt-1 text-xs text-slate-500">Salvar um produto novo cria sempre um rascunho. Publicação e arquivamento são ações separadas.</p>
          </div>
          {currentProduct ? (
            <ProductLifecycleActions
              productId={currentProduct.id}
              status={currentProduct.status}
              expectedUpdatedAt={expectedUpdatedAt}
              disabled={dirty || saving}
              onUpdated={lifecycleUpdated}
            />
          ) : (
            <p className="text-xs font-medium text-slate-500">Salve o rascunho antes de publicar.</p>
          )}
        </div>
      </section>

      {formError ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{formError}</div> : null}
      {success ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</div> : null}

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">{dirty ? "Há alterações não salvas." : "Nenhuma alteração pendente."}</p>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          Salvar alterações
        </button>
      </div>
    </form>
  )
}
