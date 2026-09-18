"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { formatCep } from "@/lib/checkout"

export interface AddressBookAddress {
  id: string
  label: string
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  isDefault: boolean
}

interface AddressFormState {
  label: string
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  isDefault: boolean
}

const EMPTY_ADDRESS: AddressFormState = {
  label: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  isDefault: false,
}

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"

function toForm(address: AddressBookAddress): AddressFormState {
  return {
    label: address.label,
    cep: formatCep(address.cep),
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    isDefault: address.isDefault,
  }
}

export function AddressBook({
  initialAddresses,
}: {
  initialAddresses: AddressBookAddress[]
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AddressFormState>(EMPTY_ADDRESS)
  const [open, setOpen] = useState(initialAddresses.length === 0)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function update<K extends keyof AddressFormState>(
    field: K,
    value: AddressFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }))
    setMessage(null)
  }

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY_ADDRESS)
    setOpen(false)
    setMessage(null)
  }

  function startCreate() {
    setEditingId(null)
    setForm({
      ...EMPTY_ADDRESS,
      isDefault: initialAddresses.length === 0,
    })
    setOpen(true)
    setMessage(null)
  }

  function startEdit(address: AddressBookAddress) {
    setEditingId(address.id)
    setForm(toForm(address))
    setOpen(true)
    setMessage(null)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    setPending(true)
    setMessage(null)
    try {
      const response = await fetch(
        editingId ? `/api/account/addresses/${editingId}` : "/api/account/addresses",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      )
      const payload = (await response.json().catch(() => null)) as
        | { ok?: unknown; message?: unknown }
        | null

      if (!response.ok || payload?.ok !== true) {
        setMessage(
          typeof payload?.message === "string"
            ? payload.message
            : "Não foi possível salvar o endereço.",
        )
        return
      }

      resetForm()
      router.refresh()
    } catch {
      setMessage("Não foi possível salvar o endereço.")
    } finally {
      setPending(false)
    }
  }

  async function setDefault(id: string) {
    if (pending) return
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/account/addresses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: unknown }
          | null
        setMessage(
          typeof payload?.message === "string"
            ? payload.message
            : "Não foi possível alterar o endereço padrão.",
        )
        return
      }
      router.refresh()
    } catch {
      setMessage("Não foi possível alterar o endereço padrão.")
    } finally {
      setPending(false)
    }
  }

  async function remove(address: AddressBookAddress) {
    if (
      pending ||
      !window.confirm(`Excluir o endereço "${address.label}" da sua conta?`)
    ) {
      return
    }

    setPending(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/account/addresses/${address.id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: unknown }
          | null
        setMessage(
          typeof payload?.message === "string"
            ? payload.message
            : "Não foi possível excluir o endereço.",
        )
        return
      }
      if (editingId === address.id) resetForm()
      router.refresh()
    } catch {
      setMessage("Não foi possível excluir o endereço.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Endereços salvos</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Salve até 5 endereços para preencher o checkout mais rápido.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={pending || initialAddresses.length >= 5}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Adicionar endereço
        </button>
      </div>

      {message ? (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {message}
        </p>
      ) : null}

      {initialAddresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Você ainda não tem um endereço salvo.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {initialAddresses.map((address) => (
            <article
              key={address.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-950">{address.label}</h3>
                    {address.isDefault ? (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                        Padrão
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {address.street}, {address.number}
                    {address.complement ? <> — {address.complement}</> : null}
                    <br />
                    {address.neighborhood} — {address.city}/{address.state}
                    <br />
                    CEP {formatCep(address.cep)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => startEdit(address)}
                  disabled={pending}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Editar
                </button>
                {!address.isDefault ? (
                  <button
                    type="button"
                    onClick={() => void setDefault(address.id)}
                    disabled={pending}
                    className="rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                  >
                    Definir como padrão
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void remove(address)}
                  disabled={pending}
                  className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {open ? (
        <form
          onSubmit={submit}
          className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 sm:p-5"
          noValidate
        >
          <h2 className="text-lg font-bold text-slate-950">
            {editingId ? "Editar endereço" : "Novo endereço"}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="address-label" className="text-sm font-semibold text-slate-800">
                Nome do endereço
              </label>
              <input
                id="address-label"
                value={form.label}
                onChange={(event) => update("label", event.target.value)}
                placeholder="Casa"
                maxLength={40}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="address-cep" className="text-sm font-semibold text-slate-800">
                CEP
              </label>
              <input
                id="address-cep"
                value={form.cep}
                onChange={(event) => update("cep", formatCep(event.target.value))}
                inputMode="numeric"
                placeholder="00000-000"
                required
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]">
            <div>
              <label htmlFor="address-street" className="text-sm font-semibold text-slate-800">
                Rua / Avenida
              </label>
              <input
                id="address-street"
                value={form.street}
                onChange={(event) => update("street", event.target.value)}
                maxLength={120}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="address-number" className="text-sm font-semibold text-slate-800">
                Número
              </label>
              <input
                id="address-number"
                value={form.number}
                onChange={(event) => update("number", event.target.value)}
                maxLength={20}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="address-complement" className="text-sm font-semibold text-slate-800">
              Complemento
            </label>
            <input
              id="address-complement"
              value={form.complement}
              onChange={(event) => update("complement", event.target.value)}
              maxLength={80}
              className={inputClass}
            />
          </div>

          <div className="mt-4">
            <label htmlFor="address-neighborhood" className="text-sm font-semibold text-slate-800">
              Bairro
            </label>
            <input
              id="address-neighborhood"
              value={form.neighborhood}
              onChange={(event) => update("neighborhood", event.target.value)}
              maxLength={80}
              required
              className={inputClass}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_100px]">
            <div>
              <label htmlFor="address-city" className="text-sm font-semibold text-slate-800">
                Cidade
              </label>
              <input
                id="address-city"
                value={form.city}
                onChange={(event) => update("city", event.target.value)}
                maxLength={80}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="address-state" className="text-sm font-semibold text-slate-800">
                UF
              </label>
              <input
                id="address-state"
                value={form.state}
                onChange={(event) => update("state", event.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                required
                className={inputClass}
              />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => update("isDefault", event.target.checked)}
              className="size-4 rounded border-slate-300 text-violet-600"
            />
            Usar como endereço padrão
          </label>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {pending ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar endereço"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={pending}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
