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
  const pageCount = Math.ceil(items.length / itemsPerPage)
  const pages = Array.from({ length: pageCount }, (_, pageIndex) =>
    items.slice(pageIndex * itemsPerPage, (pageIndex + 1) * itemsPerPage),
  )

  const getCarouselPages = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return []
    return Array.from(carousel.querySelectorAll<HTMLElement>("[data-carousel-page]"))
  }, [])

  const updateScrollState = useCallback(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    const pageElements = getCarouselPages()
    if (pageElements.length === 0) {
      setActivePage(0)
      return
    }

    const firstPageOffset = pageElements[0].offsetLeft
    let nearestPage = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    pageElements.forEach((page, pageIndex) => {
      const distance = Math.abs(page.offsetLeft - firstPageOffset - carousel.scrollLeft)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestPage = pageIndex
      }
    })

    setActivePage(nearestPage)
  }, [getCarouselPages])

  useEffect(() => {
    const updateItemsPerPage = () => setItemsPerPage(getItemsPerPage())
    updateItemsPerPage()
    window.addEventListener("resize", updateItemsPerPage)
    return () => window.removeEventListener("resize", updateItemsPerPage)
  }, [])

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    setActivePage(0)
    carousel.scrollTo({ left: 0, behavior: "auto" })

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState)
    observer?.observe(carousel)

    return () => observer?.disconnect()
  }, [itemsPerPage, updateScrollState])

  const scrollToPage = (page: number) => {
    const carousel = carouselRef.current
    const pageElements = getCarouselPages()
    if (!carousel || pageElements.length === 0) return

    const nextPage = Math.min(pageElements.length - 1, Math.max(0, page))
    const firstPageOffset = pageElements[0].offsetLeft

    carousel.scrollTo({
      left: Math.max(0, pageElements[nextPage].offsetLeft - firstPageOffset),
      behavior: "smooth",
    })
  }

  const canScrollLeft = activePage > 0
  const canScrollRight = activePage < pageCount - 1

  return (
    <div className="relative">
      {pageCount > 1 ? (
        <button
          type="button"
          onClick={() => scrollToPage(activePage - 1)}
          disabled={!canScrollLeft}
          aria-label="Ver página anterior de produtos"
          className="absolute -left-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:-left-3 sm:flex sm:h-11 sm:w-11"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}

      <div
        ref={carouselRef}
        onScroll={updateScrollState}
        aria-label="Produtos em destaque"
        className="-mx-4 snap-x snap-mandatory overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
      >
        <div className="flex">
          {pages.map((page, pageIndex) => (
            <div
              key={pageIndex}
              data-carousel-page
              aria-label={`Página ${pageIndex + 1} de ${pageCount}`}
              className="w-full shrink-0 snap-start"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {page}
              </div>
            </div>
          ))}
        </div>
      </div>

      {pageCount > 1 ? (
        <>
          <button
            type="button"
            onClick={() => scrollToPage(activePage + 1)}
            disabled={!canScrollRight}
            aria-label="Ver próxima página de produtos"
            className="absolute -right-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white/95 text-slate-900 shadow-md transition hover:bg-violet-50 disabled:pointer-events-none disabled:opacity-0 sm:-right-3 sm:flex sm:h-11 sm:w-11"
          >
            <ArrowRight className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </button>

          <div className="mt-4 flex items-center justify-center gap-2" aria-label="Páginas dos produtos em destaque">
            {pages.map((_, pageIndex) => (
              <button
                key={pageIndex}
                type="button"
                onClick={() => scrollToPage(pageIndex)}
                aria-label={`Ir para página ${pageIndex + 1}`}
                aria-current={activePage === pageIndex ? "true" : undefined}
                className={
                  "rounded-full transition-all " +
                  (activePage === pageIndex
                    ? "h-2.5 w-2.5 bg-[#8B5CF6]"
                    : "h-2 w-2 bg-slate-200 hover:bg-slate-300")
                }
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
