import Link from "next/link"
import { HomeHighlightsCarousel } from "@/components/home-highlights-carousel"
import { HomeHighlightProductCard } from "@/components/home-highlight-product-card"
import type { StorefrontProduct } from "@/contexts/cart-context"

export function HomePage({
  products,
  unavailable = false,
}: {
  products: StorefrontProduct[]
  unavailable?: boolean
}) {
  return (
    <section className="bg-white pb-10 pt-6 lg:pb-12 lg:pt-8">
      <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-end justify-between gap-4 lg:mb-6">
          <h1 className="font-serif text-[30px] font-bold leading-none tracking-[-0.03em] text-slate-950 sm:text-4xl lg:text-[40px]">
            Destaques
          </h1>
          <Link
            href="/produtos"
            className="inline-flex shrink-0 items-center gap-1 font-serif text-[14px] font-medium leading-none text-[#7C3AED] transition-colors hover:text-[#6D28D9] sm:text-lg"
          >
            Ver todos <span aria-hidden="true">→</span>
          </Link>
        </div>

        {unavailable ? (
          <div className="border border-slate-200 bg-slate-50 px-5 py-8 text-center" role="status">
            <p className="text-base font-medium text-slate-700">Catálogo temporariamente indisponível.</p>
            <p className="mt-1 text-sm text-slate-500">Tente novamente em alguns instantes.</p>
          </div>
        ) : null}

        {!unavailable && products.length === 0 ? (
          <div className="border border-slate-200 bg-slate-50 px-5 py-8 text-center">
            <p className="text-base text-slate-600">Nenhum produto disponível no momento.</p>
          </div>
        ) : null}

        {!unavailable && products.length > 0 ? (
          <>
            <div className="lg:hidden">
              <HomeHighlightsCarousel>
                {products.map((product) => (
                  <HomeHighlightProductCard
                    key={product.id}
                    product={product}
                    className="h-full w-full"
                  />
                ))}
              </HomeHighlightsCarousel>
            </div>

            <div className="hidden lg:grid lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] lg:gap-5 xl:gap-6">
              {products.map((product) => (
                <HomeHighlightProductCard
                  key={product.id}
                  product={product}
                  className="h-full min-w-0"
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
