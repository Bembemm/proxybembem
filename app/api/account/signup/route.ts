import { createClient } from "@supabase/supabase-js"
import { type NextRequest } from "next/server"
import {
  CustomerPasswordPolicyError,
  isSameOriginAccountRequest,
  parseAccountSignupInput,
} from "../../../../lib/server/customer-account-actions.ts"
import {
  getSupabaseEnv,
  resolvePublicSiteUrl,
} from "../../../../lib/server/env.ts"
import { consumeRateLimit } from "../../../../lib/server/rate-limit.ts"
import { readJsonBody } from "../../../../lib/server/request-body.ts"
import { createSupabaseAuthServerClient } from "../../../../lib/supabase/auth-server.ts"

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

async function registeredEmailExists(email: string) {
  const env = getSupabaseEnv()
  const admin = createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1_000,
    })
    if (error) {
      throw new Error("Customer signup email lookup failed")
    }

    if (
      data.users.some(
        (user) => user.email?.trim().toLowerCase() === email,
      )
    ) {
      return true
    }

    if (data.users.length < 1_000) {
      return false
    }
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginAccountRequest(request)) {
    return json(403, { ok: false, message: "Requisição inválida." })
  }

  try {
    if (!(await consumeRateLimit({ request, scope: "account-signup" }))) {
      return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  let input: ReturnType<typeof parseAccountSignupInput>
  try {
    input = parseAccountSignupInput(await readJsonBody(request, 4_096))
  } catch (error) {
    if (error instanceof CustomerPasswordPolicyError) {
      return json(400, { ok: false, message: error.message })
    }
    return json(400, { ok: false, message: "Dados de cadastro inválidos." })
  }

  try {
    if (await registeredEmailExists(input.email)) {
      return json(409, {
        ok: false,
        message:
          "Este e-mail já está cadastrado. Entre na sua conta ou redefina sua senha.",
      })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  let emailRedirectTo: string
  try {
    const siteUrl = resolvePublicSiteUrl(request.nextUrl.origin)
    emailRedirectTo = new URL(
      `/auth/callback?next=${encodeURIComponent(input.next)}`,
      siteUrl,
    ).toString()
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  try {
    const supabase = createSupabaseAuthServerClient()
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo,
        data: {
          name: input.name,
          whatsapp: input.whatsapp,
        },
      },
    })
    if (error) {
      if (error.status === 429) {
        return json(429, { ok: false, message: "Tente novamente em alguns minutos." })
      }
      if (typeof error.status !== "number" || error.status >= 500) {
        return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
      }
      return json(400, {
        ok: false,
        message: "Não foi possível criar a conta com esses dados.",
      })
    }
  } catch {
    return json(503, { ok: false, message: "Serviço temporariamente indisponível." })
  }

  return json(202, {
    ok: true,
    message: "Cadastro recebido. Verifique seu e-mail para continuar.",
  })
}
