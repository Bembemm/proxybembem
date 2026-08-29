-- Before applying this migration in an existing environment, duplicate payment IDs
-- must be resolved explicitly. The executable guard below fails closed before the
-- unique index or RPC are created.
do $$
begin
  if exists (
    select 1
    from public.orders
    where payment_id is not null
    group by payment_id
    having count(*) > 1
  ) then
    raise exception 'duplicate payment_id values exist in public.orders; resolve duplicates before applying this migration';
  end if;
end;
$$;

create unique index if not exists orders_payment_id_uidx
  on public.orders (payment_id)
  where payment_id is not null;

create or replace function public.apply_mercadopago_payment_event(
  p_order_number text,
  p_payment_id text,
  p_incoming_status text,
  p_status_detail text,
  p_paid_cents integer,
  p_currency_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_expected_cents integer;
  v_amount_matches boolean;
  v_outcome text := 'updated';
begin
  select *
    into v_order
    from public.orders
   where order_number = p_order_number
   for update;

  if not found then
    return jsonb_build_object(
      'outcome', 'not_found',
      'order_number', null,
      'payment_status', null,
      'payment_id', null,
      'expected_cents', null,
      'received_cents', p_paid_cents
    );
  end if;

  v_expected_cents := coalesce(v_order.total_cents, v_order.subtotal_cents);
  v_amount_matches := p_paid_cents = v_expected_cents and p_currency_id = 'BRL';

  -- Once approved, only the same payment may repeat approval or move to a reversal.
  if v_order.payment_status = 'approved' then
    if v_order.payment_id is distinct from p_payment_id then
      v_outcome := 'ignored';
    elsif p_incoming_status = 'approved' then
      v_outcome := 'ignored';
    elsif p_incoming_status in ('refunded', 'charged_back') then
      update public.orders
         set payment_status = p_incoming_status,
             payment_status_detail = p_status_detail,
             payment_id = p_payment_id
       where id = v_order.id
       returning * into v_order;
      v_outcome := 'updated';
    else
      v_outcome := 'ignored';
    end if;

    return jsonb_build_object(
      'outcome', v_outcome,
      'order_number', v_order.order_number,
      'payment_status', v_order.payment_status,
      'payment_id', v_order.payment_id,
      'expected_cents', v_expected_cents,
      'received_cents', p_paid_cents
    );
  end if;

  -- Reversal states cannot be overwritten by a different payment or by a non-reversal status.
  if v_order.payment_status in ('refunded', 'charged_back') then
    if v_order.payment_id is distinct from p_payment_id
       or p_incoming_status not in ('refunded', 'charged_back') then
      v_outcome := 'ignored';
    else
      update public.orders
         set payment_status = p_incoming_status,
             payment_status_detail = p_status_detail,
             payment_id = p_payment_id
       where id = v_order.id
       returning * into v_order;
      v_outcome := 'updated';
    end if;

    return jsonb_build_object(
      'outcome', v_outcome,
      'order_number', v_order.order_number,
      'payment_status', v_order.payment_status,
      'payment_id', v_order.payment_id,
      'expected_cents', v_expected_cents,
      'received_cents', p_paid_cents
    );
  end if;

  -- An approval is trusted only when the provider amount and currency match the server total.
  if p_incoming_status = 'approved' and not v_amount_matches then
    update public.orders
       set payment_status = 'manual_review',
           payment_status_detail = 'amount_or_currency_mismatch',
           payment_id = p_payment_id
     where id = v_order.id
     returning * into v_order;

    return jsonb_build_object(
      'outcome', 'manual_review',
      'order_number', v_order.order_number,
      'payment_status', v_order.payment_status,
      'payment_id', v_order.payment_id,
      'expected_cents', v_expected_cents,
      'received_cents', p_paid_cents
    );
  end if;

  update public.orders
     set payment_status = p_incoming_status,
         payment_status_detail = p_status_detail,
         payment_id = p_payment_id
   where id = v_order.id
   returning * into v_order;

  return jsonb_build_object(
    'outcome', 'updated',
    'order_number', v_order.order_number,
    'payment_status', v_order.payment_status,
    'payment_id', v_order.payment_id,
    'expected_cents', v_expected_cents,
    'received_cents', p_paid_cents
  );
end;
$$;

revoke all on function public.apply_mercadopago_payment_event(text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.apply_mercadopago_payment_event(text,text,text,text,integer,text) to service_role;
