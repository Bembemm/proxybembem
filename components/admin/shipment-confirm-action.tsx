"use client"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100)
}

type Difference =
  | { kind: "store_pays"; cents: number }
  | { kind: "margin"; cents: number }
  | { kind: "even"; cents: 0 }
  | null

type PurchaseProps = {
  kind: "purchase"
  action: string
  buttonLabel: string
  environment: "sandbox" | "production"
  customerPaidCents: number
  labelCostCents: number
  difference: Difference
}

type CancelProps = {
  kind: "cancel"
  action: string
  buttonLabel: string
  currentState: string
}

function DifferenceCopy({ difference }: { difference: Difference }) {
  if (!difference) return <span>Diferença indisponível</span>
  if (difference.kind === "store_pays") {
    return <span>Diferença: loja paga +{formatMoney(difference.cents)}</span>
  }
  if (difference.kind === "margin") {
    return <span>Diferença: margem +{formatMoney(difference.cents)}</span>
  }
  return <span>Diferença: sem ajuste</span>
}

export function ShipmentConfirmAction(props: PurchaseProps | CancelProps) {
  if (props.kind === "purchase") {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            {props.buttonLabel}
          </button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar compra da etiqueta</DialogTitle>
            <DialogDescription className="leading-6">
              Esta ação compra uma etiqueta no ambiente {props.environment === "production" ? "Production" : "Sandbox"}.
              Confira os valores antes de confirmar.
            </DialogDescription>
          </DialogHeader>

          <dl className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Cliente pagou</dt>
              <dd className="font-semibold text-slate-900">{formatMoney(props.customerPaidCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Etiqueta agora</dt>
              <dd className="font-semibold text-slate-900">{formatMoney(props.labelCostCents)}</dd>
            </div>
            <div className="text-slate-600">
              <DifferenceCopy difference={props.difference} />
            </div>
          </dl>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Voltar
              </button>
            </DialogClose>
            <form method="post" action={props.action}>
              <input type="hidden" name="expectedCostCents" value={props.labelCostCents} />
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 sm:w-auto"
              >
                Confirmar compra
              </button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex w-full items-center justify-center rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 sm:w-auto"
        >
          {props.buttonLabel}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar cancelamento da etiqueta</DialogTitle>
          <DialogDescription className="leading-6 text-rose-800">
            Estado atual: {props.currentState}. O cancelamento é enviado ao provedor e não garante reembolso ou estorno imediato. Não cancele se a etiqueta já tiver sido usada.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Voltar
            </button>
          </DialogClose>
          <form method="post" action={props.action}>
            <input type="hidden" name="confirmation" value="cancel-label" />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 sm:w-auto"
            >
              Sim, cancelar etiqueta
            </button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
