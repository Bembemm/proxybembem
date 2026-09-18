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
        "group grid grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-3 rounded-xl bg-white sm:block " +
        className
      }
    >
      <Link
        href={productHref(product)}
        className="relative block aspect-square overflow-hidden rounded-lg bg-slate-100 sm:aspect-[4/3]"
        aria-label={"Ver detalhes de " + product.title}
      >
        <Image
          src={product.image}
          alt={product.title}
          fill
          sizes="(max-width: 639px) 44vw, (max-width: 1023px) 50vw, 25vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </Link>

      <div className="flex min-w-0 flex-col py-0.5 sm:p-3 sm:pt-4">
        <h3 className="line-clamp-3 text-[15px] font-semibold leading-[1.25] text-slate-950 sm:min-h-[3rem] sm:line-clamp-2 sm:text-base">
          <Link
            href={productHref(product)}
            className="transition-colors hover:text-[#7C3AED]"
          >
            {product.title}
          </Link>
        </h3>

        <div className="mt-2 sm:mt-3">
          {hasDiscount ? (
            <span className="block text-xs text-slate-500 line-through sm:text-sm">
              {formatPrice(product.originalPrice)}
            </span>
          ) : null}

          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold leading-none text-[#7C3AED] sm:text-2xl">
              {formatPrice(product.discountPrice)}
            </span>
            {hasDiscount ? (
              <span className="rounded-md bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#7C3AED] sm:text-xs">
                {discount}% OFF
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-auto pt-3 sm:mt-4 sm:pt-0">
          <AddToCartButton
            product={product}
            label="Adicionar ao carrinho"
            variant="solid"
          />
        </div>
      </div>
    </article>
  )
}
