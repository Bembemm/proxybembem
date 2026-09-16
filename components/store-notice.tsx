interface StoreNoticeProps {
  noticeEnabled: boolean
  noticeText: string | null
}

export function StoreNotice({ noticeEnabled, noticeText }: StoreNoticeProps) {
  if (!noticeEnabled || !noticeText) return null

  return (
    <aside
      role="status"
      aria-label="Aviso da loja"
      className="border-y border-[#8B5CF6]/20 bg-[#8B5CF6]/10 px-4 py-2.5"
    >
      <p className="mx-auto max-w-[1180px] text-center text-sm font-medium text-slate-800 sm:text-base">
        {noticeText}
      </p>
    </aside>
  )
}
