create or replace function public.complete_notification_attempt(
  p_notification_id uuid,
  p_worker_id uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox%rowtype;
  v_next_attempt integer;
  v_error_code text;
  v_early_delivered_at timestamptz;
  v_early_bounced_at timestamptz;
  v_early_failed_at timestamptz;
  v_early_suppressed boolean;
begin
  if p_notification_id is null or p_worker_id is null
     or p_outcome not in ('accepted', 'retryable', 'rejected')
     or (p_provider_message_id is not null and pg_catalog.char_length(p_provider_message_id) not between 1 and 128)
     or (p_error_code is not null and pg_catalog.char_length(p_error_code) not between 1 and 120) then
    raise exception 'invalid notification completion input';
  end if;

  if p_outcome = 'accepted' then
    if p_provider_message_id is null then
      raise exception 'accepted notification requires provider message id';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_provider_message_id, 0)
    );
  end if;

  select *
    into v_row
    from public.notification_outbox
   where id = p_notification_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'outcome', 'not_found',
      'notification_id', null,
      'status', null,
      'attempt_count', null
    );
  end if;

  if v_row.status <> 'processing'
     or v_row.processing_worker_id is distinct from p_worker_id then
    return pg_catalog.jsonb_build_object(
      'outcome', 'conflict',
      'notification_id', v_row.id,
      'status', v_row.status,
      'attempt_count', v_row.attempt_count
    );
  end if;

  v_next_attempt := v_row.attempt_count + 1;
  if v_next_attempt > 3 then
    raise exception 'notification attempt limit exceeded';
  end if;

  v_error_code := case
    when p_error_code is null then null
    else pg_catalog.left(p_error_code, 120)
  end;

  if p_outcome = 'accepted' then
    update public.notification_outbox
       set status = 'sent',
           attempt_count = v_next_attempt,
           provider_message_id = p_provider_message_id,
           next_attempt_at = null,
           processing_worker_id = null,
           processing_lease_expires_at = null,
           last_error_code = null,
           sent_at = coalesce(sent_at, pg_catalog.now()),
           updated_at = pg_catalog.now()
     where id = v_row.id
     returning * into v_row;

    update public.notification_webhook_events
       set notification_id = v_row.id
     where provider_message_id = p_provider_message_id
       and notification_id is null;

    select
      min(received_at) filter (where event_type = 'email.delivered'),
      min(received_at) filter (where event_type = 'email.bounced'),
      min(received_at) filter (where event_type in ('email.failed', 'email.suppressed')),
      coalesce(bool_or(event_type = 'email.suppressed'), false)
      into
        v_early_delivered_at,
        v_early_bounced_at,
        v_early_failed_at,
        v_early_suppressed
      from public.notification_webhook_events
     where notification_id = v_row.id;

    if v_early_delivered_at is not null then
      update public.notification_outbox
         set status = 'delivered',
             delivered_at = coalesce(delivered_at, v_early_delivered_at),
             last_error_code = null,
             updated_at = pg_catalog.now()
       where id = v_row.id
       returning * into v_row;
    elsif v_early_bounced_at is not null then
      update public.notification_outbox
         set status = 'bounced',
             bounced_at = coalesce(bounced_at, v_early_bounced_at),
             last_error_code = 'provider_bounced',
             updated_at = pg_catalog.now()
       where id = v_row.id
       returning * into v_row;
    elsif v_early_failed_at is not null then
      update public.notification_outbox
         set status = 'failed',
             failed_at = coalesce(failed_at, v_early_failed_at),
             last_error_code = case
               when v_early_suppressed then 'provider_suppressed'
               else 'provider_failed'
             end,
             updated_at = pg_catalog.now()
       where id = v_row.id
       returning * into v_row;
    end if;

  elsif p_outcome = 'rejected' then
    update public.notification_outbox
       set status = 'failed',
           attempt_count = v_next_attempt,
           next_attempt_at = null,
           processing_worker_id = null,
           processing_lease_expires_at = null,
           last_error_code = coalesce(v_error_code, 'provider_rejected'),
           failed_at = coalesce(failed_at, pg_catalog.now()),
           updated_at = pg_catalog.now()
     where id = v_row.id
     returning * into v_row;

  elsif v_next_attempt >= 3 then
    update public.notification_outbox
       set status = 'failed',
           attempt_count = v_next_attempt,
           next_attempt_at = null,
           processing_worker_id = null,
           processing_lease_expires_at = null,
           last_error_code = coalesce(v_error_code, 'retry_exhausted'),
           failed_at = coalesce(failed_at, pg_catalog.now()),
           updated_at = pg_catalog.now()
     where id = v_row.id
     returning * into v_row;

  else
    update public.notification_outbox
       set status = 'retry_scheduled',
           attempt_count = v_next_attempt,
           next_attempt_at = case
             when v_next_attempt = 1 then pg_catalog.now() + interval '5 minutes'
             else pg_catalog.now() + interval '30 minutes'
           end,
           processing_worker_id = null,
           processing_lease_expires_at = null,
           last_error_code = coalesce(v_error_code, 'provider_retryable'),
           updated_at = pg_catalog.now()
     where id = v_row.id
     returning * into v_row;
  end if;

  return pg_catalog.jsonb_build_object(
    'outcome', 'recorded',
    'notification_id', v_row.id,
    'status', v_row.status,
    'attempt_count', v_row.attempt_count
  );
end;
$$;

revoke all on function public.complete_notification_attempt(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_notification_attempt(uuid, uuid, text, text, text)
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

  if p_event_type = 'email.sent' then
    update public.notification_outbox
       set status = 'sent',
           sent_at = coalesce(sent_at, pg_catalog.now()),
           updated_at = pg_catalog.now()
     where provider_message_id = p_provider_message_id
       and status in ('processing', 'sent')
     returning id, status into v_notification_id, v_status;

  elsif p_event_type = 'email.delivered' then
    update public.notification_outbox
       set status = 'delivered',
           delivered_at = coalesce(delivered_at, pg_catalog.now()),
           last_error_code = null,
           updated_at = pg_catalog.now()
     where provider_message_id = p_provider_message_id
       and status in ('sent', 'delivered')
     returning id, status into v_notification_id, v_status;

  elsif p_event_type = 'email.bounced' then
    update public.notification_outbox
       set status = 'bounced',
           bounced_at = coalesce(bounced_at, pg_catalog.now()),
           last_error_code = 'provider_bounced',
           updated_at = pg_catalog.now()
     where provider_message_id = p_provider_message_id
       and status not in ('delivered', 'bounced')
     returning id, status into v_notification_id, v_status;

  else
    update public.notification_outbox
       set status = 'failed',
           failed_at = coalesce(failed_at, pg_catalog.now()),
           last_error_code = case
             when p_event_type = 'email.suppressed' then 'provider_suppressed'
             else 'provider_failed'
           end,
           updated_at = pg_catalog.now()
     where provider_message_id = p_provider_message_id
       and status not in ('delivered', 'bounced', 'failed')
     returning id, status into v_notification_id, v_status;
  end if;

  if v_notification_id is not null then
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
