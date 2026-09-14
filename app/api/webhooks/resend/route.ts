import { getResendWebhookSecret } from "../../../../lib/server/env.ts"
import {
  createResendWebhookHandler,
  recordResendWebhookEvent,
} from "../../../../lib/server/resend-webhook.ts"

export const POST = createResendWebhookHandler({
  getSecret: getResendWebhookSecret,
  record: recordResendWebhookEvent,
})
