import { type NextRequest } from "next/server"
import { isSameOriginAccountRequest } from "../../../../lib/server/customer-account-actions.ts"
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts"

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function POST(request: NextRequest) {
  if (!isSameOriginAccountRequest(request)) {
    return json(403, { ok: false, message: "Requisição inválida." })
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signOut({ scope: "local" })
    if (error) {
      return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  return json(200, { ok: true })
}
