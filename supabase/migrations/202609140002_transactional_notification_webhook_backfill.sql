update public.notification_webhook_events e
   set notification_id = n.id
  from public.notification_outbox n
 where e.notification_id is null
   and n.provider_message_id = e.provider_message_id;
