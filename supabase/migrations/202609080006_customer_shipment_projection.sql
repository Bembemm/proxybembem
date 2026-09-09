create or replace function public.customer_get_order(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_order record;
  v_timeline jsonb;
  v_shipment record;
  v_shipment_timeline jsonb := '[]'::jsonb;
  v_shipment_status text;
  v_shipment_projection jsonb := null;
begin
  if v_customer_id is null then
    raise insufficient_privilege using message = 'authentication required';
  end if;

  select
    o.id,
    o.order_number,
    o.items,
    o.subtotal_cents,
    o.shipping_cents,
    o.total_cents,
    o.payment_status,
    o.fulfillment_status,
    o.created_at,
    o.updated_at,
    o.shipping_service_name,
    o.shipping_carrier_name,
    o.shipping_delivery_days,
    o.customer_name,
    o.whatsapp,
    o.customer_email,
    o.address_street,
    o.address_number,
    o.address_complement,
    o.address_neighborhood,
    o.address_city,
    o.address_state
  into v_order
  from public.orders o
  where o.id = p_order_id
    and o.customer_id = v_customer_id;

  if not found then
    return null;
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'kind', t.kind,
               'created_at', t.created_at
             )
             order by t.created_at, t.id
           ),
           '[]'::jsonb
         )
    into v_timeline
    from (
      select
        ev.id,
        ev.created_at,
        case
          when ev.event_type = 'payment_status_changed'
            and ev.metadata ->> 'payment_status' = 'approved'
            then 'payment_approved'
          when ev.event_type = 'payment_status_changed'
            and ev.metadata ->> 'payment_status' in ('refunded', 'charged_back')
            then 'payment_reversed'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'in_production'
            then 'production_started'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'ready_to_ship'
            then 'ready_to_ship'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'shipped'
            then 'shipped'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'completed'
            then 'completed'
          when ev.event_type = 'fulfillment_status_changed'
            and ev.metadata ->> 'to' = 'canceled'
            then 'canceled'
          else null
        end as kind
      from public.order_events ev
      where ev.order_id = p_order_id
    ) t
    where t.kind is not null;

  select
    s.id,
    s.state,
    s.carrier_name,
    s.service_name,
    s.tracking_code,
    s.updated_at
  into v_shipment
  from public.shipments s
  where s.order_id = p_order_id
  order by s.created_at desc, s.id desc
  limit 1;

  if found then
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'kind', t.kind,
                 'created_at', t.created_at
               )
               order by t.created_at
             ),
             '[]'::jsonb
           )
      into v_shipment_timeline
      from (
        select
          t.kind,
          min(t.created_at) as created_at
        from (
          select
            case
              when se.event_type = 'shipment_posted' then 'posted'
              when se.event_type = 'shipment_tracking_updated'
                and se.metadata ->> 'to' = 'posted' then 'posted'
              when se.event_type = 'shipment_tracking_updated'
                and se.metadata ->> 'to' = 'in_transit' then 'in_transit'
              when se.event_type = 'shipment_tracking_updated'
                and se.metadata ->> 'to' = 'delivered' then 'delivered'
              else null
            end as kind,
            se.created_at
          from public.shipment_events se
          where se.shipment_id = v_shipment.id
        ) t
        where t.kind is not null
        group by t.kind
      ) t;

    v_shipment_status := case
      when v_shipment.state in (
        'draft',
        'prepared',
        'in_cart',
        'purchase_pending',
        'purchased',
        'generation_pending',
        'generated'
      ) then 'preparing'
      when v_shipment.state = 'posted' then 'posted'
      when v_shipment.state = 'in_transit' then 'in_transit'
      when v_shipment.state = 'delivered' then 'delivered'
      when v_shipment.state = 'canceled' then 'canceled'
      when v_shipment.state = 'attention_required' then 'attention'
      when v_shipment.state = 'cancel_pending' then 'attention'
      else 'attention'
    end;

    v_shipment_projection := jsonb_build_object(
      'carrier_name', v_shipment.carrier_name,
      'service_name', v_shipment.service_name,
      'tracking_code', v_shipment.tracking_code,
      'status', v_shipment_status,
      'updated_at', v_shipment.updated_at,
      'timeline', v_shipment_timeline
    );
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'items', v_order.items,
    'subtotal_cents', v_order.subtotal_cents,
    'shipping_cents', v_order.shipping_cents,
    'total_cents', v_order.total_cents,
    'payment_status', v_order.payment_status,
    'fulfillment_status', v_order.fulfillment_status,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'shipping_service_name', v_order.shipping_service_name,
    'shipping_carrier_name', v_order.shipping_carrier_name,
    'shipping_delivery_days', v_order.shipping_delivery_days,
    'customer_name', v_order.customer_name,
    'whatsapp', v_order.whatsapp,
    'customer_email', v_order.customer_email,
    'address_street', v_order.address_street,
    'address_number', v_order.address_number,
    'address_complement', v_order.address_complement,
    'address_neighborhood', v_order.address_neighborhood,
    'address_city', v_order.address_city,
    'address_state', v_order.address_state,
    'timeline', v_timeline,
    'shipment', v_shipment_projection
  );
end;
$$;

revoke all on function public.customer_get_order(uuid)
  from public, anon;
grant execute on function public.customer_get_order(uuid)
  to authenticated;
