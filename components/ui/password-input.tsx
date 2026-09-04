"use client"

import { Eye, EyeOff } from "lucide-react"
import { useState, type InputHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type?: "password"
}

export function PasswordInput({
  className,
  type: _type,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative w-full">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("w-full pr-11", className)}
      />
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  )
}
