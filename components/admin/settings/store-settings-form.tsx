"use client"

import { Loader2, Save } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import {
  validateStoreSettingsMutationInput,
  type StoreSettings,
} from "../../../lib/store-settings/store-settings.ts"

const CONFLICT_MESSAGE =
  "As configurações foram alteradas em outra sessão. Recarregue antes de salvar."

interface EditorValues {
  productionLeadTimeBusinessDays: string
  contactEmail: string
  contactWhatsappE164: string
  noticeEnabled: boolean
  noticeText: string
}

function valuesFromSettings(settings: StoreSettings): EditorValues {
  return {
    productionLeadTimeBusinessDays: String(settings.productionLeadTimeBusinessDays),
    contactEmail: settings.contactEmail ?? "",
    contactWhatsappE164: settings.contactWhatsappE164 ?? "",
    noticeEnabled: settings.noticeEnabled,
    noticeText: settings.noticeText ?? "",
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseSavedSettings(value: unknown): StoreSettings | null {
  if (!isRecord(value) || value.id !== "default") return null
  if (
    typeof value.updatedAt !== "string" ||
    !value.updatedAt.trim() ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return null
  }

  const parsed = validateStoreSettingsMutationInput({
    productionLeadTimeBusinessDays: value.productionLeadTimeBusinessDays,
    contactEmail: value.contactEmail,
    contactWhatsappE164: value.contactWhatsappE164,
    noticeEnabled: value.noticeEnabled,
    noticeText: value.noticeText,
  })
  if (!parsed.ok) return null

  return {
    id: "default",
    ...parsed.value,
    updatedAt: value.updatedAt,
  }
}

export function StoreSettingsForm({ settings }: { settings: StoreSettings }) {
  const [values, setValues] = useState<EditorValues>(() => valuesFromSettings(settings))
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(settings.updatedAt)
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

  function update<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      if (!current[key] && !current._form) return current
      const next = { ...current }
      delete next[key]
      delete next._form
      return next
    })
    setDirty(true)
    setFormError(null)
    setSuccess(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setFieldErrors({})
    setFormError(null)
    setSuccess(null)

    const requestBody = {
      expectedUpdatedAt,
      productionLeadTimeBusinessDays: Number(values.productionLeadTimeBusinessDays),
      contactEmail: values.contactEmail.trim() ? values.contactEmail.trim() : null,
      contactWhatsappE164: values.contactWhatsappE164.trim()
        ? values.contactWhatsappE164.trim()
        : null,
      noticeEnabled: values.noticeEnabled,
      noticeText: values.noticeText.trim() ? values.noticeText.trim() : null,
    }

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })
      const payload = (await response.json().catch(() => null)) as unknown

      if (
        response.status === 409 &&
        isRecord(payload) &&
        payload.error === "store_settings_conflict"
      ) {
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

      const saved =
        response.ok && isRecord(payload) ? parseSavedSettings(payload.settings) : null
      if (!saved) {
        setFormError("Não foi possível salvar as configurações.")
        return
      }

      setExpectedUpdatedAt(saved.updatedAt)
      setValues(valuesFromSettings(saved))
      setDirty(false)
      setSuccess("Configurações salvas com sucesso.")
    } catch {
      setFormError("Não foi possível salvar as configurações.")
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100 disabled:text-slate-500"

  return (
    <form onSubmit={submit} className="w-full max-w-2xl space-y-6" noValidate>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Operação</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Defina o prazo padrão informado ao cliente para preparação dos pedidos.
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Prazo de produção em dias úteis
          </span>
          <input
            type="number"
            min={1}
            max={15}
            step={1}
            value={values.productionLeadTimeBusinessDays}
            onChange={(event) =>
              update("productionLeadTimeBusinessDays", event.target.value)
            }
            aria-invalid={Boolean(fieldErrors.productionLeadTimeBusinessDays)}
            className={inputClass}
          />
          {fieldErrors.productionLeadTimeBusinessDays ? (
            <span className="mt-1 block text-xs text-rose-600">
              {fieldErrors.productionLeadTimeBusinessDays}
            </span>
          ) : null}
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Contato</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Estes dados podem aparecer nas áreas públicas de suporte da loja.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</span>
            <input
              type="email"
              maxLength={254}
              value={values.contactEmail}
              onChange={(event) => update("contactEmail", event.target.value)}
              aria-invalid={Boolean(fieldErrors.contactEmail)}
              className={inputClass}
              placeholder="contato@exemplo.com.br"
            />
            {fieldErrors.contactEmail ? (
              <span className="mt-1 block text-xs text-rose-600">{fieldErrors.contactEmail}</span>
            ) : null}
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">WhatsApp</span>
            <input
              type="tel"
              maxLength={20}
              value={values.contactWhatsappE164}
              onChange={(event) => update("contactWhatsappE164", event.target.value)}
              aria-invalid={Boolean(fieldErrors.contactWhatsappE164)}
              className={inputClass}
              placeholder="+5544991250332"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Use o formato E.164 com código do país, por exemplo +55 seguido do DDD e número.
            </span>
            {fieldErrors.contactWhatsappE164 ? (
              <span className="mt-1 block text-xs text-rose-600">
                {fieldErrors.contactWhatsappE164}
              </span>
            ) : null}
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Aviso da loja</h2>
        <label className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.noticeEnabled}
            onChange={(event) => update("noticeEnabled", event.target.checked)}
            className="mt-0.5 size-4 rounded border-slate-300 text-violet-600"
          />
          <span>
            <strong className="block font-semibold text-slate-900">Exibir aviso público</strong>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
              Ative somente quando houver uma mensagem operacional relevante para clientes.
            </span>
          </span>
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Mensagem</span>
          <textarea
            maxLength={400}
            rows={4}
            value={values.noticeText}
            onChange={(event) => update("noticeText", event.target.value)}
            aria-invalid={Boolean(fieldErrors.noticeText)}
            className={`${inputClass} resize-y`}
            placeholder="Ex.: Prazo especial de produção nesta semana."
          />
          <span className="mt-1 block text-xs text-slate-500">
            {values.noticeText.length}/400 caracteres
          </span>
          {fieldErrors.noticeText ? (
            <span className="mt-1 block text-xs text-rose-600">{fieldErrors.noticeText}</span>
          ) : null}
        </label>
      </section>

      {fieldErrors._form ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {fieldErrors._form}
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </form>
  )
}
