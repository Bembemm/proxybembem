import Image from "next/image"
import Link from "next/link"
import { Eye } from "lucide-react"
import { AddToCartButton } from "@/components/add-to-cart-button"
import type { StorefrontProduct } from "@/contexts/cart-context"
import { productHref } from "@/lib/products/product-url"

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export function StorefrontProductCard({
  product,
  className = "",
}: {
  product: StorefrontProduct
  className?: string
}) {
  return (
    <article
      className={
        "group relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md transition-all duration-300 hover:border-[#8B5CF6]/40 hover:shadow-lg " +
        className
      }
    >
      <Link
        href={productHref(product)}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-100"
        aria-label={"Ver detalhes de " + product.title}
      >
        <Image
          src={product.image}
          alt={product.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />

        <span className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-transparent opacity-60" />

        <span className="absolute inset-0 flex items-center justify-center bg-[#8B5CF6]/0 transition-colors duration-300 group-hover:bg-[#8B5CF6]/15">
          <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#8B5CF6] opacity-0 shadow-sm transition-opacity duration-300 group-hover:opacity-100">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Ver Detalhes
          </span>
        </span>

        {product.tag ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-[#8B5CF6] px-2 py-1 text-xs font-semibold uppercase tracking-wider text-white sm:left-2 sm:top-2 sm:px-2.5 sm:text-sm">
            {product.tag}
          </span>
        ) : null}
      </Link>

      <div className="relative p-2 sm:p-3">
        <h3 className="mb-1.5 min-h-[2.5rem] line-clamp-2 text-sm font-semibold leading-snug text-slate-900 sm:mb-2 sm:min-h-[3rem] sm:text-base">
          <Link href={productHref(product)} className="transition-colors hover:text-[#7C3AED]">
            {product.title}
          </Link>
        </h3>

        <div className="mb-2 flex flex-col gap-0.5 sm:mb-3 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="text-xs text-slate-500 opacity-70 line-through sm:text-sm">
            {formatPrice(product.originalPrice)}
          </span>
          <span className="text-base font-bold text-[#8B5CF6] sm:text-xl">
            {formatPrice(product.discountPrice)}
          </span>
        </div>

        <div className="space-y-1.5">
          <AddToCartButton product={product} />
          <Link
            href={productHref(product)}
            className="flex h-9 w-full items-center justify-center rounded-md text-xs text-slate-500 transition hover:bg-[#8B5CF6]/5 hover:text-[#8B5CF6] active:scale-[0.98] sm:text-sm"
          >
            <Eye className="mr-1 h-3 w-3" aria-hidden="true" />
            Ver Detalhes
          </Link>
        </div>
      </div>
    </article>
  )
}
