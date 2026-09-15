interface WhatsAppFloatingButtonProps {
  contactWhatsappE164: string | null
}

export function WhatsAppFloatingButton({ contactWhatsappE164 }: WhatsAppFloatingButtonProps) {
  if (!contactWhatsappE164) return null

  const digits = contactWhatsappE164.replace(/\D/g, "")
  if (!digits) return null

  const whatsappUrl = `https://wa.me/${digits}`

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-xl transition-all hover:scale-105 hover:bg-green-600 hover:shadow-2xl active:scale-95 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
      aria-label="Falar pelo WhatsApp"
      title="Falar pelo WhatsApp"
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="h-7 w-7 fill-current sm:h-8 sm:w-8"
      >
        <path d="M19.11 17.205c-.372-.186-2.197-1.083-2.537-1.207-.34-.124-.588-.186-.835.186-.248.372-.96 1.207-1.176 1.455-.217.248-.433.279-.805.093-.371-.186-1.568-.578-2.986-1.843-1.104-.984-1.85-2.198-2.066-2.57-.217-.371-.023-.572.163-.757.167-.166.371-.433.557-.65.186-.216.248-.371.372-.619.124-.248.062-.464-.031-.65-.093-.186-.836-2.012-1.145-2.755-.301-.724-.607-.626-.835-.638-.216-.011-.464-.013-.712-.013-.248 0-.65.093-.99.464-.34.372-1.3 1.269-1.3 3.095 0 1.826 1.331 3.59 1.517 3.838.186.248 2.619 4.001 6.345 5.611.886.382 1.577.61 2.116.781.889.283 1.698.243 2.337.148.713-.106 2.197-.898 2.506-1.765.31-.867.31-1.61.217-1.765-.093-.155-.341-.248-.712-.434Z" />
        <path d="M16.026 3C8.835 3 3 8.781 3 15.91c0 2.51.725 4.852 1.978 6.833L3.1 29l6.45-1.84a13.12 13.12 0 0 0 6.476 1.708C23.218 28.868 29 23.087 29 15.91 29 8.781 23.218 3 16.026 3Zm0 23.68a10.93 10.93 0 0 1-5.57-1.523l-.4-.238-3.827 1.092 1.11-3.72-.261-.415a10.69 10.69 0 0 1-1.69-5.966c0-5.93 4.77-10.723 10.638-10.723 5.868 0 10.638 4.793 10.638 10.723 0 5.977-4.77 10.77-10.638 10.77Z" />
      </svg>
    </a>
  )
}
