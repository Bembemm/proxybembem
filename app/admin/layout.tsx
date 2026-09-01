import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Administração",
  robots: {
    index: false,
    follow: false,
  },
}

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-slate-100 font-sans text-slate-950">{children}</div>
}
