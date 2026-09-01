"use client"

export default function AdminError() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">Área administrativa indisponível</h1>
      <p className="text-sm text-muted-foreground">
        Não foi possível validar o acesso administrativo. Tente entrar novamente.
      </p>
      <a href="/admin/login" className="underline">
        Voltar ao login
      </a>
    </main>
  )
}
