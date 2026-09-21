import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Eye } from "lucide-react"

import type { StorefrontProduct } from "@/contexts/cart-context"
import { productHref } from "@/lib/products/product-url"

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function discountPercent(product: StorefrontProduct) {
  if (product.originalPrice <= product.discountPrice) return 0
  return Math.round((1 - product.discountPrice / product.originalPrice) * 100)
}

export function HomeHighlightProductCard({
  product,
  className = "",
  priority = false,
}: {
  product: StorefrontProduct
  className?: string
  priority?: boolean
}) {
  const discount = discountPercent(product)
  const hasDiscount = discount > 0
  const href = productHref(product)

  return (
    <article
      className={
        "group grid grid-cols-[44%_minmax(0,1fr)] items-stretch gap-4 bg-white sm:block lg:flex lg:h-full lg:flex-col lg:gap-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-sm lg:transition-[border-color,box-shadow,transform] lg:duration-200 lg:hover:-translate-y-0.5 lg:hover:border-violet-200 lg:hover:shadow-md " +
        className
      }
    >
      <Link
        href={href}
        className="relative block aspect-square w-full overflow-hidden rounded-[6px] bg-slate-100 sm:aspect-[4/3] sm:rounded-lg lg:shrink-0 lg:rounded-none"
        aria-label={"Ver produto " + product.title}
      >
        <Image
          src={product.image}
          alt={product.title}
          fill
          priority={priority}
          sizes="(max-width: 639px) 44vw, (max-width: 1023px) 50vw, 25vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]"
        />
      </Link>

      <div className="flex min-w-0 flex-col pb-2 pt-0.5 sm:p-3 sm:pt-4 lg:flex-1 lg:p-4 lg:pt-4">
        <h3 className="line-clamp-3 font-serif text-[17px] font-semibold leading-[1.08] tracking-[-0.02em] text-slate-950 sm:min-h-[3rem] sm:line-clamp-2 sm:text-base sm:leading-snug sm:tracking-normal lg:min-h-[2.75rem]">
          <Link
            href={href}
            className="transition-colors hover:text-[#7C3AED]"
          >
            {product.title}
          </Link>
        </h3>

        <div className="mt-2.5 sm:mt-3 lg:mt-1.5">
          {hasDiscount ? (
            <span className="block text-[12px] leading-none text-slate-500 line-through sm:text-sm">
              {formatPrice(product.originalPrice)}
            </span>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-2">
            <span className="font-serif text-[23px] font-semibold leading-none tracking-[-0.03em] text-[#7C3AED] sm:text-2xl sm:font-bold sm:tracking-normal">
              {formatPrice(product.discountPrice)}
            </span>
            {hasDiscount ? (
              <span className="rounded-[5px] bg-[#F1EAFE] px-1.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.01em] text-[#7C3AED] sm:px-2 sm:text-xs">
                {discount}% OFF
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-auto lg:pt-4">
          <Link
            href={href}
            className="inline-flex h-9 w-[92%] items-center justify-center gap-2 rounded-[8px] border border-[#C4A5FF] bg-white px-2 font-serif text-[12px] font-medium text-[#7C3AED] transition-colors hover:border-[#A78BFA] hover:bg-[#F8F5FF] hover:text-[#6D28D9] active:bg-[#F3EDFF] sm:h-10 sm:w-full sm:text-sm lg:h-11 lg:rounded-xl"
            aria-label={"Ver produto " + product.title}
          >
            <Eye className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span>Ver produto</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  )
}
