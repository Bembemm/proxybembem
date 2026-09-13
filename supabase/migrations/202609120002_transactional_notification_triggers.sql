create or replace function public.insert_transactional_order_notification(
  p_order_id uuid,
  p_notification_type text,
  p_dedupe_key text,
  p_provider_idempotency_key text,
  p_shipment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_shipment public.shipments%rowtype;
  v_items jsonb;
  v_payload jsonb;
  v_carrier_name text;
  v_service_name text;
  v_tracking_code text;
begin
  if p_order_id is null
     or p_notification_type not in (
       'payment_approved',
       'production_started',
       'ready_to_ship',
       'shipped',
       'delivered',
       'canceled',
       'refunded',
       'charged_back'
     )
     or p_dedupe_key is null
     or pg_catalog.char_length(p_dedupe_key) not between 1 and 255
     or p_provider_idempotency_key is null
     or pg_catalog.char_length(p_provider_idempotency_key) not between 1 and 255 then
    raise exception 'invalid transactional notification input';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id;

  if not found then
    return;
  end if;

  if v_order.customer_email is null
     or pg_catalog.char_length(v_order.customer_email) not between 3 and 320
     or v_order.customer_name is null
     or v_order.order_number is null
     or v_order.subtotal_cents is null
     or coalesce(v_order.total_cents, v_order.subtotal_cents) is null
     or v_order.address_street is null
     or v_order.address_number is null
     or v_order.address_neighborhood is null
     or v_order.address_city is null
     or v_order.address_state is null
     or v_order.cep is null
     or v_order.items is null
     or pg_catalog.jsonb_typeof(v_order.items) <> 'array'
     or pg_catalog.jsonb_array_length(v_order.items) < 1 then
    return;
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'title', item ->> 'title',
      'unitPriceCents', (item ->> 'unitPriceCents')::integer,
      'quantity', (item ->> 'quantity')::integer
    )
    order by ordinality
  )
  into v_items
  from pg_catalog.jsonb_array_elements(v_order.items) with ordinality as items(item, ordinality);

  if p_shipment_id is not null then
    select *
      into v_shipment
      from public.shipments
     where id = p_shipment_id
       and order_id = p_order_id;

    if not found then
      return;
    end if;

    v_carrier_name := v_shipment.carrier_name;
    v_service_name := v_shipment.service_name;
    v_tracking_code := v_shipment.tracking_code;
  else
    v_carrier_name := v_order.shipping_carrier_name;
    v_service_name := v_order.shipping_service_name;
    v_tracking_code := null;
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'version', 1,
    'type', p_notification_type,
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'orderUrl', 'https://www.proxybembem.com.br/minha-conta/pedidos/' || v_order.id::text,
    'customerName', v_order.customer_name,
    'items', v_items,
    'subtotalCents', v_order.subtotal_cents,
    'shippingCents', v_order.shipping_cents,
    'totalCents', coalesce(v_order.total_cents, v_order.subtotal_cents),
    'address', pg_catalog.jsonb_build_object(
      'street', v_order.address_street,
      'number', v_order.address_number,
      'complement', v_order.address_complement,
      'neighborhood', v_order.address_neighborhood,
      'city', v_order.address_city,
      'state', v_order.address_state,
      'cep', v_order.cep
    ),
    'carrierName', v_carrier_name,
    'serviceName', v_service_name,
    'trackingCode', v_tracking_code
  );

  insert into public.notification_outbox (
    order_id,
    notification_type,
    recipient_email,
    template_payload,
    dedupe_key,
    provider_idempotency_key,
    status,
    attempt_count,
    next_attempt_at
  ) values (
    v_order.id,
    p_notification_type,
    v_order.customer_email,
    v_payload,
    p_dedupe_key,
    p_provider_idempotency_key,
    'pending',
    0,
    pg_catalog.now()
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.insert_transactional_order_notification(uuid,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.insert_transactional_order_notification(uuid,text,text,text,uuid)
  to service_role;

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
    elsif new.metadata ->> 'to' = 'canceled' then
      v_notification_type := 'canceled';
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

create or replace function public.enqueue_shipment_event_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_type text;
begin
  if new.event_type = 'shipment_posted'
     and new.source = 'admin' then
    v_notification_type := 'shipped';
  elsif new.event_type = 'shipment_tracking_updated'
        and new.source = 'melhor_envio'
        and new.metadata ->> 'to' = 'delivered' then
    v_notification_type := 'delivered';
  end if;

  if v_notification_type is not null then
    perform public.insert_transactional_order_notification(
      new.order_id,
      v_notification_type,
      'shipment-event:' || new.id::text,
      'shipment-event:' || new.id::text,
      new.shipment_id
    );
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_shipment_event_notification()
  from public, anon, authenticated;
grant execute on function public.enqueue_shipment_event_notification()
  to service_role;

drop trigger if exists enqueue_order_event_notification_trigger on public.order_events;
create trigger enqueue_order_event_notification_trigger
  after insert on public.order_events
  for each row
  execute function public.enqueue_order_event_notification();

drop trigger if exists enqueue_shipment_event_notification_trigger on public.shipment_events;
create trigger enqueue_shipment_event_notification_trigger
  after insert on public.shipment_events
  for each row
  execute function public.enqueue_shipment_event_notification();
