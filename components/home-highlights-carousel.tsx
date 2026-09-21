"use client"

import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"

function getItemsPerPage() {
  if (typeof window === "undefined") return 1
  return window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 2 : 1
}

export function HomeHighlightsCarousel({ children }: { children: ReactNode }) {
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState(1)
  const [activePage, setActivePage] = useState(0)
  const items = useMemo(() => Children.toArray(children), [children])
  const pageCount = Math.max(1, Math.ceil(items.length / itemsPerPage))

  const updateScrollState = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth)
    if (maxScrollLeft === 0 || pageCount <= 1) {
      setActivePage(0)
      return
    }

    const progress = Math.min(1, Math.max(0, carousel.scrollLeft / maxScrollLeft))
    setActivePage(Math.round(progress * (pageCount - 1)))
  }, [pageCount])

  useEffect(() => {
    const updateItemsPerPage = () => setItemsPerPage(getItemsPerPage())
    updateItemsPerPage()
    window.addEventListener("resize", updateItemsPerPage)
    return () => window.removeEventListener("resize", updateItemsPerPage)
  }, [])

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    carousel.scrollTo({ left: 0, behavior: "auto" })
    setActivePage(0)

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState)
    observer?.observe(carousel)

    return () => observer?.disconnect()
  }, [itemsPerPage, updateScrollState])

  const goToPage = (page: number) => {
    const carousel = carouselRef.current
    if (!carousel) return

    const nextPage = Math.min(pageCount - 1, Math.max(0, page))
    const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth)
    const left =
      pageCount <= 1 ? 0 : (maxScrollLeft * nextPage) / (pageCount - 1)

    carousel.scrollTo({
      left,
      behavior: "smooth",
    })
  }

  const safeActivePage = Math.min(activePage, Math.max(0, pageCount - 1))
  const canScrollLeft = safeActivePage > 0
  const canScrollRight = safeActivePage < pageCount - 1

  return (
    <div className="relative">
      {pageCount > 1 ? (
        <button
          type="button"
          onClick={() => goToPage(safeActivePage - 1)}
          disabled={!canScrollLeft}
          aria-label="Ver página anterior de produtos"
          className="absolute -left-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:flex"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}

      <div
        ref={carouselRef}
        onScroll={updateScrollState}
        aria-label="Produtos em destaque"
        className="-mx-2 snap-x snap-mandatory overflow-x-auto scroll-smooth px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex">
          {items.map((item, itemIndex) => {
            const isPageStart = itemIndex % itemsPerPage === 0

            return (
              <div
                key={itemIndex}
                data-carousel-item
                aria-label={`Produto ${itemIndex + 1} de ${items.length}`}
                className={
                  "w-full shrink-0 px-2 sm:w-1/2 lg:w-1/4 " +
                  (isPageStart ? "snap-start" : "")
                }
              >
                {item}
              </div>
            )
          })}
        </div>
      </div>

      {pageCount > 1 ? (
        <button
          type="button"
          onClick={() => goToPage(safeActivePage + 1)}
          disabled={!canScrollRight}
          aria-label="Ver próxima página de produtos"
          className="absolute -right-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:flex"
        >
          <ArrowRight className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}

      {pageCount > 1 ? (
        <div
          className="mt-4 flex items-center justify-center gap-2 sm:mt-4"
          aria-label="Páginas dos produtos em destaque"
        >
          {Array.from({ length: pageCount }, (_, pageIndex) => (
            <button
              key={pageIndex}
              type="button"
              onClick={() => goToPage(pageIndex)}
              aria-label={`Ir para página ${pageIndex + 1}`}
              aria-current={safeActivePage === pageIndex ? "true" : undefined}
              className={
                "h-2 w-2 rounded-full transition-all sm:h-2 sm:w-2 " +
                (safeActivePage === pageIndex
                  ? "bg-[#7C3AED]"
                  : "bg-slate-200 hover:bg-slate-300")
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
