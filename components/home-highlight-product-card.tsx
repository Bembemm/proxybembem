import Image from "next/image"
import Link from "next/link"

import { AddToCartButton } from "@/components/add-to-cart-button"
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
}: {
  product: StorefrontProduct
  className?: string
}) {
  const discount = discountPercent(product)
  const hasDiscount = discount > 0

  return (
    <article
      className={
        "group grid grid-cols-[44%_minmax(0,1fr)] items-stretch gap-[14px] bg-white sm:block " +
        className
      }
    >
      <Link
        href={productHref(product)}
        className="relative block aspect-square w-full overflow-hidden rounded-[6px] bg-slate-100 sm:aspect-[4/3] sm:rounded-lg"
        aria-label={"Ver detalhes de " + product.title}
      >
        <Image
          src={product.image}
          alt={product.title}
          fill
          sizes="(max-width: 639px) 44vw, (max-width: 1023px) 50vw, 25vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]"
        />
      </Link>

      <div className="flex min-w-0 flex-col sm:p-3 sm:pt-4">
        <h3 className="line-clamp-2 font-serif text-[14px] font-semibold leading-[1.12] tracking-[-0.015em] text-slate-950 sm:min-h-[3rem] sm:text-base sm:leading-snug sm:tracking-normal">
          <Link
            href={productHref(product)}
            className="transition-colors hover:text-[#7C3AED]"
          >
            {product.title}
          </Link>
        </h3>

        <div className="mt-2 sm:mt-3">
          {hasDiscount ? (
            <span className="block text-[11px] leading-none text-slate-500 line-through sm:text-sm">
              {formatPrice(product.originalPrice)}
            </span>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:mt-1 sm:gap-x-2">
            <span className="font-serif text-[20px] font-semibold leading-none tracking-[-0.025em] text-[#7C3AED] sm:text-2xl sm:font-bold sm:tracking-normal">
              {formatPrice(product.discountPrice)}
            </span>
            {hasDiscount ? (
              <span className="rounded-[5px] bg-[#F1EAFE] px-1.5 py-1 text-[9px] font-semibold uppercase leading-none tracking-[0.01em] text-[#7C3AED] sm:px-2 sm:text-xs">
                {discount}% OFF
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-auto pt-2.5 sm:mt-4 sm:pt-0">
          <AddToCartButton
            product={product}
            label="Adicionar ao carrinho"
            variant="solid"
            compact
          />
        </div>
      </div>
    </article>
  )
}
