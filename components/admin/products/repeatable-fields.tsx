"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import type { ProductDetail, ProductSection } from "../../../lib/products/product.ts"

interface RepeatableFieldsProps {
  highlights: string[]
  details: ProductDetail[]
  sections: ProductSection[]
  onHighlightsChange(value: string[]): void
  onDetailsChange(value: ProductDetail[]): void
  onSectionsChange(value: ProductSection[]): void
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const removed = next.splice(index, 1)[0]
  if (removed === undefined) return items
  next.splice(target, 0, removed)
  return next
}

function MoveButtons({
  index,
  count,
  onMove,
}: {
  index: number
  count: number
  onMove(direction: -1 | 1): void
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        title="Mover para cima"
        className="rounded-md border border-slate-200 p-2 text-slate-500 transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ArrowUp className="size-4" aria-hidden="true" />
        <span className="sr-only">Mover para cima</span>
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === count - 1}
        title="Mover para baixo"
        className="rounded-md border border-slate-200 p-2 text-slate-500 transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ArrowDown className="size-4" aria-hidden="true" />
        <span className="sr-only">Mover para baixo</span>
      </button>
    </div>
  )
}

export function RepeatableFields({
  highlights,
  details,
  sections,
  onHighlightsChange,
  onDetailsChange,
  onSectionsChange,
}: RepeatableFieldsProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Destaques</h4>
            <p className="text-xs text-slate-500">Frases curtas exibidas como benefícios do produto.</p>
          </div>
          <button
            type="button"
            onClick={() => onHighlightsChange([...highlights, ""])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar destaque
          </button>
        </div>
        {highlights.map((highlight, index) => (
          <div key={`highlight-${index}`} className="flex items-start gap-2">
            <input
              value={highlight}
              maxLength={500}
              onChange={(event) => {
                const next = [...highlights]
                next[index] = event.target.value
                onHighlightsChange(next)
              }}
              placeholder="Ex.: Impressão em alta qualidade"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
            <MoveButtons
              index={index}
              count={highlights.length}
              onMove={(direction) => onHighlightsChange(moveItem(highlights, index, direction))}
            />
            <button
              type="button"
              onClick={() => onHighlightsChange(highlights.filter((_, itemIndex) => itemIndex !== index))}
              title="Remover"
              className="rounded-md border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              <span className="sr-only">Remover</span>
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Detalhes</h4>
            <p className="text-xs text-slate-500">Pares de rótulo e valor exibidos na ficha do produto.</p>
          </div>
          <button
            type="button"
            onClick={() => onDetailsChange([...details, { label: "", value: "" }])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar detalhe
          </button>
        </div>
        {details.map((detail, index) => (
          <div key={`detail-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_auto]">
              <input
                value={detail.label}
                maxLength={160}
                onChange={(event) => {
                  const next = [...details]
                  next[index] = { ...detail, label: event.target.value }
                  onDetailsChange(next)
                }}
                placeholder="Rótulo"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
              <input
                value={detail.value}
                maxLength={3000}
                onChange={(event) => {
                  const next = [...details]
                  next[index] = { ...detail, value: event.target.value }
                  onDetailsChange(next)
                }}
                placeholder="Valor"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
              <div className="flex gap-1">
                <MoveButtons
                  index={index}
                  count={details.length}
                  onMove={(direction) => onDetailsChange(moveItem(details, index, direction))}
                />
                <button
                  type="button"
                  onClick={() => onDetailsChange(details.filter((_, itemIndex) => itemIndex !== index))}
                  title="Remover"
                  className="rounded-md border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sr-only">Remover</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Seções adicionais</h4>
            <p className="text-xs text-slate-500">Blocos de título e parágrafos da descrição detalhada.</p>
          </div>
          <button
            type="button"
            onClick={() => onSectionsChange([...sections, { title: "", paragraphs: [""] }])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar seção
          </button>
        </div>
        {sections.map((section, index) => (
          <div key={`section-${index}`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-2">
              <input
                value={section.title}
                maxLength={160}
                onChange={(event) => {
                  const next = [...sections]
                  next[index] = { ...section, title: event.target.value }
                  onSectionsChange(next)
                }}
                placeholder="Título da seção"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
              <MoveButtons
                index={index}
                count={sections.length}
                onMove={(direction) => onSectionsChange(moveItem(sections, index, direction))}
              />
              <button
                type="button"
                onClick={() => onSectionsChange(sections.filter((_, itemIndex) => itemIndex !== index))}
                title="Remover"
                className="rounded-md border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                <span className="sr-only">Remover</span>
              </button>
            </div>

            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <div key={`paragraph-${paragraphIndex}`} className="flex items-start gap-2">
                <textarea
                  value={paragraph}
                  maxLength={5000}
                  rows={3}
                  onChange={(event) => {
                    const paragraphs = [...section.paragraphs]
                    paragraphs[paragraphIndex] = event.target.value
                    const next = [...sections]
                    next[index] = { ...section, paragraphs }
                    onSectionsChange(next)
                  }}
                  placeholder="Parágrafo"
                  className="min-w-0 flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    const paragraphs = section.paragraphs.filter((_, itemIndex) => itemIndex !== paragraphIndex)
                    const next = [...sections]
                    next[index] = { ...section, paragraphs }
                    onSectionsChange(next)
                  }}
                  title="Remover"
                  className="rounded-md border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sr-only">Remover</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const next = [...sections]
                next[index] = { ...section, paragraphs: [...section.paragraphs, ""] }
                onSectionsChange(next)
              }}
              className="text-xs font-semibold text-violet-700 hover:text-violet-900"
            >
              Adicionar parágrafo
            </button>
          </div>
        ))}
      </section>
    </div>
  )
}
