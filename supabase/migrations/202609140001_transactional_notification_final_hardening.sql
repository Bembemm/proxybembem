create or replace function public.enqueue_order_event_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_type text;
begin
  if new.event_type = 'payment_status_changed'
     and new.source = 'mercadopago' then
    if new.metadata ->> 'payment_status' = 'approved' then
      v_notification_type := 'payment_approved';
    elsif new.metadata ->> 'payment_status' = 'refunded' then
      v_notification_type := 'refunded';
    elsif new.metadata ->> 'payment_status' = 'charged_back' then
      v_notification_type := 'charged_back';
    end if;
  elsif new.event_type = 'fulfillment_status_changed'
        and new.source = 'admin' then
    if new.metadata ->> 'to' = 'in_production' then
      v_notification_type := 'production_started';
    elsif new.metadata ->> 'to' = 'ready_to_ship' then
      v_notification_type := 'ready_to_ship';
    elsif new.metadata ->> 'to' = 'canceled'
          and exists (
            select 1
              from public.order_events
             where order_id = new.order_id
               and event_type = 'payment_status_changed'
               and source = 'mercadopago'
               and metadata ->> 'payment_status' = 'approved'
          ) then
      v_notification_type := 'canceled';
    elsif new.metadata ->> 'to' = 'shipped'
          and exists (
            select 1
              from public.orders o
             where o.id = new.order_id
               and o.shipping_provider is distinct from 'melhor_envio'
          ) then
      v_notification_type := 'shipped';
    end if;
  end if;

  if v_notification_type is not null then
    perform public.insert_transactional_order_notification(
      new.order_id,
      v_notification_type,
      'order-event:' || new.id::text,
      'order-event:' || new.id::text,
      null
    );
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_order_event_notification()
  from public, anon, authenticated;
grant execute on function public.enqueue_order_event_notification()
  to service_role;

create or replace function public.record_notification_webhook(
  p_svix_id text,
  p_event_type text,
  p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_notification_id uuid;
  v_status text;
begin
  if p_svix_id is null or pg_catalog.char_length(p_svix_id) not between 1 and 128
     or p_event_type not in (
       'email.sent',
       'email.delivered',
       'email.bounced',
       'email.failed',
       'email.suppressed'
     )
     or p_provider_message_id is null
     or pg_catalog.char_length(p_provider_message_id) not between 1 and 128 then
    raise exception 'invalid notification webhook input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_message_id, 0)
  );

  insert into public.notification_webhook_events (
    svix_id,
    event_type,
    provider_message_id
  ) values (
    p_svix_id,
    p_event_type,
    p_provider_message_id
  )
  on conflict (svix_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return pg_catalog.jsonb_build_object(
      'outcome', 'duplicate',
      'matched', false
    );
  end if;

  select id, status
    into v_notification_id, v_status
    from public.notification_outbox
   where provider_message_id = p_provider_message_id;

  if v_notification_id is not null then
    if p_event_type = 'email.sent'
       and v_status in ('processing', 'sent') then
      update public.notification_outbox
         set status = 'sent',
             sent_at = coalesce(sent_at, pg_catalog.now()),
             updated_at = pg_catalog.now()
       where id = v_notification_id
       returning status into v_status;

    elsif p_event_type = 'email.delivered'
          and v_status in ('sent', 'delivered') then
      update public.notification_outbox
         set status = 'delivered',
             delivered_at = coalesce(delivered_at, pg_catalog.now()),
             last_error_code = null,
             updated_at = pg_catalog.now()
       where id = v_notification_id
       returning status into v_status;

    elsif p_event_type = 'email.bounced'
          and v_status not in ('delivered', 'bounced') then
      update public.notification_outbox
         set status = 'bounced',
             bounced_at = coalesce(bounced_at, pg_catalog.now()),
             last_error_code = 'provider_bounced',
             updated_at = pg_catalog.now()
       where id = v_notification_id
       returning status into v_status;

    elsif p_event_type in ('email.failed', 'email.suppressed')
          and v_status not in ('delivered', 'bounced', 'failed') then
      update public.notification_outbox
         set status = 'failed',
             failed_at = coalesce(failed_at, pg_catalog.now()),
             last_error_code = case
               when p_event_type = 'email.suppressed' then 'provider_suppressed'
               else 'provider_failed'
             end,
             updated_at = pg_catalog.now()
       where id = v_notification_id
       returning status into v_status;
    end if;

    update public.notification_webhook_events
       set notification_id = v_notification_id
     where id = v_event_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'outcome', 'recorded',
    'matched', v_notification_id is not null,
    'status', v_status
  );
end;
$$;

revoke all on function public.record_notification_webhook(text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_notification_webhook(text, text, text)
  to service_role;
