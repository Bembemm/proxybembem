"use client"

import { useEffect } from "react"

export function LoginConfirmationFlashCleanup() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("confirmado") !== "1") return

    url.searchParams.delete("confirmado")
    const search = url.searchParams.toString()
    const cleanPath = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`

    window.history.replaceState(window.history.state, "", cleanPath)
  }, [])

  return null
}
