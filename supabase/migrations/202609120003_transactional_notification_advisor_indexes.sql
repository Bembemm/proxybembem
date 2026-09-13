create index if not exists notification_webhook_events_notification_id_idx
  on public.notification_webhook_events (notification_id);
