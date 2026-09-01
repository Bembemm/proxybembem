alter table public.orders
  add column checkout_preference_lease_id uuid,
  add column checkout_preference_lease_expires_at timestamptz;

alter table public.orders
  add constraint orders_checkout_preference_lease_pair_check
  check (
    (checkout_preference_lease_id is null and checkout_preference_lease_expires_at is null)
    or
    (checkout_preference_lease_id is not null and checkout_preference_lease_expires_at is not null)
  );

create or replace function public.claim_checkout_preference(
  p_order_number text,
  p_checkout_fingerprint text,
  p_lease_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_now timestamptz := clock_timestamp();
  v_outcome text;
begin
  select *
    into v_order
    from public.orders
   where order_number = p_order_number
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_order.checkout_fingerprint is distinct from p_checkout_fingerprint then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if v_order.checkout_url is not null then
    return jsonb_build_object(
      'outcome', 'ready',
      'checkout_url', v_order.checkout_url
    );
  end if;

  if v_order.checkout_preference_lease_id is not null
     and v_order.checkout_preference_lease_expires_at > v_now then
    return jsonb_build_object('outcome', 'busy');
  end if;

  v_outcome := case
    when v_order.checkout_preference_lease_id is not null then 'reclaimed'
    else 'claimed'
  end;

  update public.orders
     set checkout_preference_lease_id = p_lease_id,
         checkout_preference_lease_expires_at = v_now + interval '30 seconds'
   where id = v_order.id;

  return jsonb_build_object('outcome', v_outcome);
end;
$$;

create or replace function public.complete_checkout_preference(
  p_order_number text,
  p_checkout_fingerprint text,
  p_lease_id uuid,
  p_preference_id text,
  p_checkout_url text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_preference_id is null
     or length(p_preference_id) < 1
     or length(p_preference_id) > 255
     or p_checkout_url is null
     or length(p_checkout_url) < 1
     or length(p_checkout_url) > 2048 then
    return false;
  end if;

  update public.orders
     set preference_id = p_preference_id,
         checkout_url = p_checkout_url,
         payment_status = 'pending',
         payment_status_detail = null,
         checkout_preference_lease_id = null,
         checkout_preference_lease_expires_at = null
   where order_number = p_order_number
     and checkout_fingerprint is not distinct from p_checkout_fingerprint
     and checkout_preference_lease_id = p_lease_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.mark_checkout_preference_error(
  p_order_number text,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.orders
     set payment_status = 'checkout_error',
         payment_status_detail = 'preference_creation_failed'
   where order_number = p_order_number
     and checkout_preference_lease_id = p_lease_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.claim_checkout_preference(text,text,uuid) from public, anon, authenticated;
revoke all on function public.complete_checkout_preference(text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.mark_checkout_preference_error(text,uuid) from public, anon, authenticated;

grant execute on function public.claim_checkout_preference(text,text,uuid) to service_role;
grant execute on function public.complete_checkout_preference(text,text,uuid,text,text) to service_role;
grant execute on function public.mark_checkout_preference_error(text,uuid) to service_role;
