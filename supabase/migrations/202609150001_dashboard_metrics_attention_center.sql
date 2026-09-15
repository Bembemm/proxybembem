create or replace function public.admin_get_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_as_of timestamptz := now();
  v_local_now timestamp;
  v_today_start timestamptz;
  v_week_start timestamptz;
  v_month_start timestamptz;
  v_result jsonb;
begin
  v_local_now := v_as_of at time zone 'America/Sao_Paulo';
  v_today_start := date_trunc('day', v_local_now) at time zone 'America/Sao_Paulo';
  v_week_start := date_trunc('week', v_local_now) at time zone 'America/Sao_Paulo';
  v_month_start := date_trunc('month', v_local_now) at time zone 'America/Sao_Paulo';

  with first_approvals as (
    select distinct on (ev.order_id)
      ev.order_id,
      ev.created_at as approved_at
    from public.order_events ev
    where ev.event_type = 'payment_status_changed'
      and ev.source = 'mercadopago'
      and ev.metadata ->> 'payment_status' = 'approved'
      and ev.created_at <= v_as_of
    order by ev.order_id, ev.created_at asc, ev.id asc
  ),
  first_reversals as (
    select distinct on (ev.order_id)
      ev.order_id,
      ev.created_at as reversed_at
    from public.order_events ev
    where ev.event_type = 'payment_status_changed'
      and ev.source = 'mercadopago'
      and ev.metadata ->> 'payment_status' in ('refunded', 'charged_back')
      and ev.created_at <= v_as_of
    order by ev.order_id, ev.created_at asc, ev.id asc
  ),
  orders_created as (
    select
      count(*) filter (
        where o.created_at >= v_today_start and o.created_at <= v_as_of
      ) as today_count,
      count(*) filter (
        where o.created_at >= v_week_start and o.created_at <= v_as_of
      ) as week_count,
      count(*) filter (
        where o.created_at >= v_month_start and o.created_at <= v_as_of
      ) as month_count
    from public.orders o
  ),
  approved_metrics as (
    select
      coalesce(sum(coalesce(o.total_cents, o.subtotal_cents)) filter (
        where fa.approved_at >= v_today_start and fa.approved_at <= v_as_of
      ), 0) as today_cents,
      coalesce(sum(coalesce(o.total_cents, o.subtotal_cents)) filter (
        where fa.approved_at >= v_week_start and fa.approved_at <= v_as_of
      ), 0) as week_cents,
      coalesce(sum(coalesce(o.total_cents, o.subtotal_cents)) filter (
        where fa.approved_at >= v_month_start and fa.approved_at <= v_as_of
      ), 0) as month_cents
    from first_approvals fa
    join public.orders o on o.id = fa.order_id
  ),
  reversed_metrics as (
    select
      coalesce(sum(coalesce(o.total_cents, o.subtotal_cents)) filter (
        where fr.reversed_at >= v_today_start and fr.reversed_at <= v_as_of
      ), 0) as today_cents,
      coalesce(sum(coalesce(o.total_cents, o.subtotal_cents)) filter (
        where fr.reversed_at >= v_week_start and fr.reversed_at <= v_as_of
      ), 0) as week_cents,
      coalesce(sum(coalesce(o.total_cents, o.subtotal_cents)) filter (
        where fr.reversed_at >= v_month_start and fr.reversed_at <= v_as_of
      ), 0) as month_cents
    from first_reversals fr
    join public.orders o on o.id = fr.order_id
  ),
  financial_risk as (
    select
      count(*) filter (where o.payment_status = 'manual_review') as manual_review_count,
      count(*) filter (where o.payment_status = 'refunded') as refunded_count,
      count(*) filter (where o.payment_status = 'charged_back') as charged_back_count
    from public.orders o
  ),
  operations as (
    select
      count(*) filter (where o.fulfillment_status = 'awaiting_production') as awaiting_production_count,
      count(*) filter (where o.fulfillment_status = 'in_production') as in_production_count,
      count(*) filter (where o.fulfillment_status = 'ready_to_ship') as ready_to_ship_count,
      count(*) filter (where o.fulfillment_status = 'shipped') as shipped_count
    from public.orders o
  ),
  open_attention as (
    select
      af.id,
      af.order_id,
      af.code,
      af.severity,
      af.source,
      af.opened_at,
      case af.severity
        when 'critical' then 3
        when 'warning' then 2
        when 'info' then 1
        else 0
      end as severity_rank
    from public.order_attention_flags af
    where af.resolved_at is null
      and af.opened_at <= v_as_of
  ),
  attention_ranked as (
    select
      oa.*,
      count(*) over (partition by oa.order_id) as flag_count,
      max(oa.severity_rank) over (partition by oa.order_id) as highest_severity_rank,
      row_number() over (
        partition by oa.order_id
        order by oa.severity_rank desc, oa.opened_at asc, oa.id asc
      ) as primary_rank
    from open_attention oa
  ),
  attention_per_order as (
    select
      ar.order_id,
      ar.severity,
      ar.highest_severity_rank,
      ar.flag_count,
      ar.code as primary_code,
      ar.source as primary_source,
      ar.opened_at
    from attention_ranked ar
    where ar.primary_rank = 1
  ),
  attention_summary as (
    select
      count(*) as total_orders,
      count(*) filter (where apo.highest_severity_rank = 3) as critical_orders,
      count(*) filter (where apo.highest_severity_rank = 2) as warning_orders,
      count(*) filter (where apo.highest_severity_rank = 1) as info_orders
    from attention_per_order apo
  ),
  attention_top_rows as (
    select
      apo.order_id,
      o.order_number,
      o.customer_name,
      apo.severity,
      apo.highest_severity_rank,
      apo.flag_count,
      apo.primary_code,
      apo.primary_source,
      apo.opened_at
    from attention_per_order apo
    join public.orders o on o.id = apo.order_id
    order by apo.highest_severity_rank desc, apo.opened_at asc, apo.order_id asc
    limit 5
  ),
  attention_top as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'orderId', atr.order_id,
          'orderNumber', atr.order_number,
          'customerName', atr.customer_name,
          'severity', atr.severity,
          'flagCount', atr.flag_count,
          'primaryCode', atr.primary_code,
          'primarySource', atr.primary_source,
          'openedAt', atr.opened_at
        )
        order by atr.highest_severity_rank desc, atr.opened_at asc, atr.order_id asc
      ),
      '[]'::jsonb
    ) as items
    from attention_top_rows atr
  ),
  approved_month_orders as (
    select
      o.id,
      o.items,
      fa.approved_at
    from first_approvals fa
    join public.orders o on o.id = fa.order_id
    where fa.approved_at >= v_month_start
      and fa.approved_at <= v_as_of
  ),
  month_items_raw as (
    select
      o.id as order_id,
      o.approved_at,
      item
    from approved_month_orders o
    cross join lateral jsonb_array_elements(o.items) as item
    where jsonb_typeof(item) = 'object'
      and item ? 'productId'
      and item ? 'title'
      and item ? 'quantity'
      and item ->> 'productId' ~ '^[1-9][0-9]{0,9}$'
      and item ->> 'quantity' ~ '^[1-9][0-9]{0,9}$'
      and length(item ->> 'title') between 1 and 500
      and (item ->> 'productId')::numeric <= 2147483647
      and (item ->> 'quantity')::numeric <= 2147483647
  ),
  month_items as (
    select
      mir.order_id,
      mir.approved_at,
      (mir.item ->> 'productId')::bigint as product_id,
      mir.item ->> 'title' as title,
      (mir.item ->> 'quantity')::bigint as quantity
    from month_items_raw mir
  ),
  product_totals as (
    select
      mi.product_id,
      sum(mi.quantity) as quantity
    from month_items mi
    group by mi.product_id
  ),
  product_latest_title as (
    select distinct on (mi.product_id)
      mi.product_id,
      mi.title
    from month_items mi
    order by mi.product_id, mi.approved_at desc, mi.order_id desc
  ),
  product_top_rows as (
    select
      pt.product_id,
      plt.title,
      pt.quantity
    from product_totals pt
    join product_latest_title plt on plt.product_id = pt.product_id
    order by pt.quantity desc, pt.product_id asc
    limit 10
  ),
  product_top as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'productId', ptr.product_id,
          'title', ptr.title,
          'quantity', ptr.quantity
        )
        order by ptr.quantity desc, ptr.product_id asc
      ),
      '[]'::jsonb
    ) as items
    from product_top_rows ptr
  )
  select jsonb_build_object(
    'asOf', v_as_of,
    'timezone', 'America/Sao_Paulo',
    'ordersCreated', jsonb_build_object(
      'today', oc.today_count,
      'week', oc.week_count,
      'month', oc.month_count
    ),
    'approvedGrossCents', jsonb_build_object(
      'today', am.today_cents,
      'week', am.week_cents,
      'month', am.month_cents
    ),
    'reversedCents', jsonb_build_object(
      'today', rm.today_cents,
      'week', rm.week_cents,
      'month', rm.month_cents
    ),
    'financialRisk', jsonb_build_object(
      'manualReview', fr.manual_review_count,
      'refunded', fr.refunded_count,
      'chargedBack', fr.charged_back_count
    ),
    'operations', jsonb_build_object(
      'awaitingProduction', op.awaiting_production_count,
      'inProduction', op.in_production_count,
      'readyToShip', op.ready_to_ship_count,
      'shipped', op.shipped_count
    ),
    'attention', jsonb_build_object(
      'totalOrders', ats.total_orders,
      'criticalOrders', ats.critical_orders,
      'warningOrders', ats.warning_orders,
      'infoOrders', ats.info_orders,
      'topItems', att.items
    ),
    'productsThisMonth', pt.items
  )
  into v_result
  from orders_created oc
  cross join approved_metrics am
  cross join reversed_metrics rm
  cross join financial_risk fr
  cross join operations op
  cross join attention_summary ats
  cross join attention_top att
  cross join product_top pt;

  return v_result;
end;
$$;

revoke all on function public.admin_get_dashboard_snapshot()
  from public, anon, authenticated;
grant execute on function public.admin_get_dashboard_snapshot()
  to service_role;
