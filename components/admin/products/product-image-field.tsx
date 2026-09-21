"use client"

import { ImagePlus, Loader2 } from "lucide-react"
import { useState, type ChangeEvent } from "react"
import { createAdminSupabaseBrowserClient } from "../../../lib/supabase/client.ts"

const PRODUCT_IMAGE_BUCKET = "product-images"
const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024
const PRODUCT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

interface ProductImageFieldProps {
  imagePath: string
  previewUrl?: string
  disabled?: boolean
  onChange(path: string, previewUrl: string): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function ProductImageField({
  imagePath,
  previewUrl,
  disabled = false,
  onChange,
}: ProductImageFieldProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setError(null)
    if (!PRODUCT_IMAGE_MIME_TYPES.has(file.type)) {
      setError("Use uma imagem JPEG, PNG ou WebP.")
      return
    }
    if (file.size <= 0 || file.size > PRODUCT_IMAGE_MAX_BYTES) {
      setError("A imagem deve ter no máximo 8 MiB.")
      return
    }

    setUploading(true)
    try {
      const authorizationResponse = await fetch("/api/admin/products/image-upload", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFilename: file.name,
          mimeType: file.type,
          byteSize: file.size,
        }),
      })
      const authorization = (await authorizationResponse.json().catch(() => null)) as unknown
      if (
        !authorizationResponse.ok ||
        !isRecord(authorization) ||
        typeof authorization.path !== "string" ||
        typeof authorization.token !== "string"
      ) {
        throw new Error("authorization_failed")
      }

      const supabase = createAdminSupabaseBrowserClient()
      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .uploadToSignedUrl(authorization.path, authorization.token, file, {
          contentType: file.type,
          cacheControl: "31536000",
          upsert: false,
        })
      if (uploadError) throw new Error("upload_failed")

      const { data } = supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .getPublicUrl(authorization.path)
      onChange(authorization.path, data.publicUrl)
    } catch {
      setError("Não foi possível enviar a imagem. Tente novamente.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:w-52">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Prévia do produto" className="h-full w-full object-cover" />
          ) : (
            <div className="text-center text-slate-400">
              <ImagePlus className="mx-auto mb-2 size-7" aria-hidden="true" />
              <span className="text-xs">Sem imagem</span>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-4" aria-hidden="true" />}
            {uploading ? "Enviando..." : "Selecionar imagem"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled || uploading}
              onChange={handleFile}
              className="sr-only"
            />
          </label>
          <p className="text-xs text-slate-500">JPEG, PNG ou WebP, até 8 MiB. Prefira WebP para arquivos menores. O novo arquivo só passa a fazer parte do produto depois de salvar.</p>
          {imagePath ? <p className="break-all text-xs text-slate-400">{imagePath}</p> : null}
        </div>
      </div>
      {error ? <p role="alert" className="text-sm font-medium text-rose-600">{error}</p> : null}
    </div>
  )
}
