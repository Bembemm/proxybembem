export interface MelhorEnvioSenderFormProfile {
  fullName: string
  email: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  maskedCpf: string
  version: number
}

export function MelhorEnvioSenderForm({
  profile,
  originCep,
}: {
  profile: MelhorEnvioSenderFormProfile | null
  originCep: string
}) {
  return (
    <form
      method="post"
      action="/api/internal/admin/integrations/melhor-envio/sender"
      className="space-y-5"
    >
      <input
        type="hidden"
        name="expectedVersion"
        value={profile?.version ?? ""}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
          <span>Nome completo</span>
          <input
            name="fullName"
            required
            minLength={2}
            maxLength={120}
            defaultValue={profile?.fullName ?? ""}
            autoComplete="name"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>CPF</span>
          <input
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder={profile ? "Deixe em branco para manter" : "000.000.000-00"}
            required={!profile}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
          {profile ? (
            <span className="block text-xs font-normal text-slate-500">
              CPF atual: {profile.maskedCpf}. Para trocar, informe o novo CPF.
            </span>
          ) : null}
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Telefone</span>
          <input
            name="phone"
            required
            inputMode="tel"
            maxLength={20}
            defaultValue={profile?.phone ?? ""}
            autoComplete="tel"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
          <span>E-mail</span>
          <input
            type="email"
            name="email"
            required
            maxLength={254}
            defaultValue={profile?.email ?? ""}
            autoComplete="email"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>CEP de origem</span>
          <input
            name="postalCode"
            required
            inputMode="numeric"
            maxLength={9}
            defaultValue={profile?.postalCode ?? originCep}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
          <span className="block text-xs font-normal text-slate-500">
            Deve corresponder ao CEP de origem configurado no servidor.
          </span>
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>UF</span>
          <input
            name="state"
            required
            minLength={2}
            maxLength={2}
            defaultValue={profile?.state ?? ""}
            autoComplete="address-level1"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 uppercase text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
          <span>Rua</span>
          <input
            name="street"
            required
            maxLength={120}
            defaultValue={profile?.street ?? ""}
            autoComplete="address-line1"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Número</span>
          <input
            name="number"
            required
            maxLength={20}
            defaultValue={profile?.number ?? ""}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Complemento</span>
          <input
            name="complement"
            maxLength={80}
            defaultValue={profile?.complement ?? ""}
            autoComplete="address-line2"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Bairro</span>
          <input
            name="neighborhood"
            required
            maxLength={80}
            defaultValue={profile?.neighborhood ?? ""}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Cidade</span>
          <input
            name="city"
            required
            maxLength={80}
            defaultValue={profile?.city ?? ""}
            autoComplete="address-level2"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </label>
      </div>

      <button
        type="submit"
        className="w-full rounded-lg border border-violet-600 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 sm:w-auto"
      >
        {profile ? "Salvar remetente" : "Cadastrar remetente"}
      </button>
    </form>
  )
}
