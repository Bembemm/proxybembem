const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

export function formatBRL(value: number) {
  return brlFormatter.format(value)
}

export function brlToCents(value: number) {
  return Math.round(value * 100)
}

export function centsToBRL(cents: number) {
  return cents / 100
}
