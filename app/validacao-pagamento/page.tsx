import type { Metadata } from "next"
import { ValidationPaymentClient } from "./validation-payment-client"

export const metadata: Metadata = {
  title: "Validação de pagamento",
  robots: {
    index: false,
    follow: false,
  },
}

export default function ValidationPaymentPage() {
  return <ValidationPaymentClient />
}
