create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  notification_type text not null check (
    notification_type in (
      'payment_approved',
      'production_started',
      'ready_to_ship',
      'shipped',
      'delivered',
      'canceled',
      'refunded',
      'charged_back'
    )
  ),
  recipient_email text not null check (
    pg_catalog.char_length(recipient_email) between 3 and 320
  ),
  template_payload jsonb not null check (
    pg_catalog.jsonb_typeof(template_payload) = 'object'
    and pg_catalog.octet_length(template_payload::text) <= 65536
  ),
  dedupe_key text check (
    dedupe_key is null or pg_catalog.char_length(dedupe_key) between 1 and 255
  ),
  provider_idempotency_key text not null check (
    pg_catalog.char_length(provider_idempotency_key) between 1 and 255
  ),
  provider_message_id text check (
    provider_message_id is null
    or pg_catalog.char_length(provider_message_id) between 1 and 128
  ),
  status text not null default 'pending' check (
    status in (
      'pending',
      'processing',
      'sent',
      'delivered',
      'retry_scheduled',
      'failed',
      'bounced'
    )
  ),
  attempt_count integer not null default 0 check (
    attempt_count between 0 and 3
  ),
  next_attempt_at timestamptz default pg_catalog.now(),
  processing_worker_id uuid,
  processing_lease_expires_at timestamptz,
  last_error_code text check (
    last_error_code is null
    or pg_catalog.char_length(last_error_code) between 1 and 120
  ),
  resend_of_id uuid references public.notification_outbox(id),
  last_attempted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (dedupe_key),
  unique (provider_idempotency_key)
);

create index if not exists notification_outbox_due_idx
  on public.notification_outbox (next_attempt_at, created_at)
  where status in ('pending', 'retry_scheduled');

create index if not exists notification_outbox_order_idx
  on public.notification_outbox (order_id, created_at desc);

create unique index if not exists notification_outbox_provider_message_idx
  on public.notification_outbox (provider_message_id)
  where provider_message_id is not null;

create unique index if not exists notification_outbox_resend_active_uidx
  on public.notification_outbox (resend_of_id)
  where resend_of_id is not null
    and status in ('pending', 'processing', 'retry_scheduled');

create table if not exists public.notification_webhook_events (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null check (
    pg_catalog.char_length(svix_id) between 1 and 128
  ),
  event_type text not null check (
    event_type in (
      'email.sent',
      'email.delivered',
      'email.bounced',
      'email.failed',
      'email.suppressed'
    )
  ),
  provider_message_id text not null check (
    pg_catalog.char_length(provider_message_id) between 1 and 128
  ),
  notification_id uuid references public.notification_outbox(id),
  received_at timestamptz not null default pg_catalog.now(),
  unique (svix_id)
);

create index if not exists notification_webhook_events_provider_message_idx
  on public.notification_webhook_events (provider_message_id, received_at desc);

alter table public.notification_outbox enable row level security;
alter table public.notification_webhook_events enable row level security;

revoke all on table public.notification_outbox from public, anon, authenticated;
revoke all on table public.notification_webhook_events from public, anon, authenticated;

grant select, insert, update on table public.notification_outbox to service_role;
grant select, insert, update on table public.notification_webhook_events to service_role;

create or replace function public.claim_due_notification_outbox(
  p_limit integer,
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  order_id uuid,
  notification_type text,
  recipient_email text,
  template_payload jsonb,
  provider_idempotency_key text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 25
     or p_worker_id is null
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'invalid notification claim input';
  end if;

  return query
  with due as (
    select n.id
      from public.notification_outbox n
     where n.attempt_count < 3
       and (
         (
           n.status in ('pending', 'retry_scheduled')
           and n.next_attempt_at <= pg_catalog.now()
         )
         or (
           n.status = 'processing'
           and n.processing_lease_expires_at is not null
           and n.processing_lease_expires_at <= pg_catalog.now()
         )
       )
     order by coalesce(n.next_attempt_at, n.created_at), n.created_at, n.id
     limit p_limit
     for update skip locked
  ), claimed as (
    update public.notification_outbox n
       set status = 'processing',
           processing_worker_id = p_worker_id,
           processing_lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
           last_attempted_at = pg_catalog.now(),
           updated_at = pg_catalog.now()
      from due
     where n.id = due.id
     returning
       n.id,
       n.order_id,
       n.notification_type,
       n.recipient_email,
       n.template_payload,
       n.provider_idempotency_key,
       n.attempt_count
  )
  select
    claimed.id,
    claimed.order_id,
    claimed.notification_type,
    claimed.recipient_email,
    claimed.template_payload,
    claimed.provider_idempotency_key,
    claimed.attempt_count
  from claimed;
end;
$$;

revoke all on function public.claim_due_notification_outbox(integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_notification_outbox(integer, uuid, integer)
  to service_role;

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
begin
  if p_notification_id is null or p_worker_id is null
     or p_outcome not in ('accepted', 'retryable', 'rejected')
     or (p_provider_message_id is not null and pg_catalog.char_length(p_provider_message_id) not between 1 and 128)
     or (p_error_code is not null and pg_catalog.char_length(p_error_code) not between 1 and 120) then
    raise exception 'invalid notification completion input';
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
    if p_provider_message_id is null then
      raise exception 'accepted notification requires provider message id';
    end if;

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

create or replace function public.admin_list_order_notifications(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_order_id is null then
    raise exception 'invalid order id';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', n.id,
        'notification_type', n.notification_type,
        'recipient_email', n.recipient_email,
        'status', n.status,
        'attempt_count', n.attempt_count,
        'last_error_code', n.last_error_code,
        'resend_of_id', n.resend_of_id,
        'last_attempted_at', n.last_attempted_at,
        'sent_at', n.sent_at,
        'delivered_at', n.delivered_at,
        'bounced_at', n.bounced_at,
        'failed_at', n.failed_at,
        'created_at', n.created_at
      ) order by n.created_at desc, n.id desc
    ),
    '[]'::jsonb
  )
    into v_result
    from public.notification_outbox n
   where n.order_id = p_order_id;

  return v_result;
end;
$$;

revoke all on function public.admin_list_order_notifications(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_list_order_notifications(uuid)
  to service_role;

create or replace function public.admin_resend_order_notification(
  p_order_id uuid,
  p_notification_id uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.notification_outbox%rowtype;
  v_created public.notification_outbox%rowtype;
begin
  if p_order_id is null or p_notification_id is null or p_admin_user_id is null then
    raise exception 'invalid notification resend input';
  end if;

  select *
    into v_original
    from public.notification_outbox
   where id = p_notification_id
     and order_id = p_order_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'outcome', 'not_found',
      'notification_id', null
    );
  end if;

  if v_original.status in ('pending', 'processing', 'retry_scheduled') then
    return pg_catalog.jsonb_build_object(
      'outcome', 'not_ready',
      'notification_id', v_original.id
    );
  end if;

  if exists (
    select 1
      from public.notification_outbox n
     where n.resend_of_id = v_original.id
       and n.status in ('pending', 'processing', 'retry_scheduled')
  ) then
    return pg_catalog.jsonb_build_object(
      'outcome', 'conflict',
      'notification_id', v_original.id
    );
  end if;

  begin
    insert into public.notification_outbox (
      order_id,
      notification_type,
      recipient_email,
      template_payload,
      dedupe_key,
      provider_idempotency_key,
      status,
      attempt_count,
      next_attempt_at,
      resend_of_id
    ) values (
      v_original.order_id,
      v_original.notification_type,
      v_original.recipient_email,
      v_original.template_payload,
      null,
      pg_catalog.gen_random_uuid()::text,
      'pending',
      0,
      pg_catalog.now(),
      v_original.id
    )
    returning * into v_created;
  exception when unique_violation then
    return pg_catalog.jsonb_build_object(
      'outcome', 'conflict',
      'notification_id', v_original.id
    );
  end;

  insert into public.admin_audit_log (
    admin_user_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values,
    metadata
  ) values (
    p_admin_user_id,
    'order',
    p_order_id::text,
    'notification_email_resent',
    null,
    pg_catalog.jsonb_build_object(
      'notification_id', v_created.id,
      'status', v_created.status
    ),
    pg_catalog.jsonb_build_object(
      'original_notification_id', v_original.id,
      'notification_type', v_original.notification_type
    )
  );

  return pg_catalog.jsonb_build_object(
    'outcome', 'created',
    'notification_id', v_created.id
  );
end;
$$;

revoke all on function public.admin_resend_order_notification(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_resend_order_notification(uuid, uuid, uuid)
  to service_role;
