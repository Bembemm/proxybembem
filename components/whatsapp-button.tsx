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
      className="fixed bottom-5 right-5 z-40 flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 border-white bg-[#25D366] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.03] active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
      aria-label="Falar pelo WhatsApp"
      title="Falar pelo WhatsApp"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-8 w-8 fill-current"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.074-.297-.148-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.208-.242-.58-.487-.501-.669-.51-.173-.009-.371-.011-.57-.011-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.993c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0 0 12.055 0C5.495 0 .16 5.335.157 11.892a11.82 11.82 0 0 0 1.589 5.946L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.689 1.448h.005c6.558 0 11.894-5.336 11.897-11.893a11.82 11.82 0 0 0-3.489-8.413Z" />
      </svg>
    </a>
  )
}
