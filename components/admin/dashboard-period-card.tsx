import type { LucideIcon } from "lucide-react"

type DashboardPeriodCardProps = {
  title: string
  description: string
  today: string
  week: string
  month: string
  icon: LucideIcon
  tone?: "default" | "warning"
}

export function DashboardPeriodCard({
  title,
  description,
  today,
  week,
  month,
  icon: Icon,
  tone = "default",
}: DashboardPeriodCardProps) {
  const iconTone =
    tone === "warning"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-violet-50 text-violet-700 ring-violet-200"

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${iconTone}`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white">
        <div className="min-w-0 px-1.5 py-3 sm:px-2">
          <dt className="text-xs font-medium text-slate-500">Hoje</dt>
          <dd className="mt-1 whitespace-nowrap text-[clamp(0.6875rem,0.8vw,0.875rem)] font-bold leading-tight tracking-tight tabular-nums text-slate-950">
            {today}
          </dd>
        </div>
        <div className="min-w-0 px-1.5 py-3 sm:px-2">
          <dt className="text-xs font-medium text-slate-500">Semana</dt>
          <dd className="mt-1 whitespace-nowrap text-[clamp(0.6875rem,0.8vw,0.875rem)] font-bold leading-tight tracking-tight tabular-nums text-slate-950">
            {week}
          </dd>
        </div>
        <div className="min-w-0 px-1.5 py-3 sm:px-2">
          <dt className="text-xs font-medium text-slate-500">Mês</dt>
          <dd className="mt-1 whitespace-nowrap text-[clamp(0.6875rem,0.8vw,0.875rem)] font-bold leading-tight tracking-tight tabular-nums text-slate-950">
            {month}
          </dd>
        </div>
      </dl>
    </article>
  )
}
