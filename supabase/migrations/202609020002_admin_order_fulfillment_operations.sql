create or replace function public.admin_list_orders(
  p_query text default null,
  p_payment_status text default null,
  p_fulfillment_status text default null,
  p_attention_required boolean default null,
  p_from_date date default null,
  p_to_date date default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text;
  v_search text;
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid admin order page size';
  end if;

  if p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'invalid admin order offset';
  end if;

  if p_sort is null or p_sort not in ('newest', 'oldest') then
    raise exception 'invalid admin order sort';
  end if;

  if p_fulfillment_status is not null
     and p_fulfillment_status not in (
       'awaiting_payment',
       'awaiting_production',
       'in_production',
       'ready_to_ship',
       'shipped',
       'completed',
       'canceled'
     ) then
    raise exception 'invalid fulfillment status';
  end if;

  if p_payment_status is not null
     and p_payment_status !~ '^[a-z][a-z0-9_]{0,99}$' then
    raise exception 'invalid payment status filter';
  end if;

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid admin order date range';
  end if;

  v_query := nullif(btrim(p_query), '');
  if v_query is not null and length(v_query) > 100 then
    raise exception 'admin order search is too long';
  end if;

  if v_query is not null then
    v_search := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  with filtered as (
    select
      o.id,
      o.order_number,
      o.customer_name,
      o.whatsapp,
      o.subtotal_cents,
      o.total_cents,
      o.payment_status,
      o.fulfillment_status,
      o.created_at,
      o.updated_at
    from public.orders o
    where
      (
        v_search is null
        or o.order_number ilike '%' || v_search || '%' escape '\'
        or o.customer_name ilike '%' || v_search || '%' escape '\'
        or o.whatsapp ilike '%' || v_search || '%' escape '\'
      )
      and (p_payment_status is null or o.payment_status = p_payment_status)
      and (p_fulfillment_status is null or o.fulfillment_status = p_fulfillment_status)
      and (
        p_from_date is null
        or o.created_at >= (p_from_date::timestamp at time zone 'America/Sao_Paulo')
      )
      and (
        p_to_date is null
        or o.created_at < ((p_to_date + 1)::timestamp at time zone 'America/Sao_Paulo')
      )
      and (
        p_attention_required is null
        or p_attention_required = exists (
          select 1
          from public.order_attention_flags af
          where af.order_id = o.id
            and af.resolved_at is null
        )
      )
  ),
  paged_base as (
    select f.*
    from filtered f
    order by
      case when p_sort = 'oldest' then f.created_at end asc,
      case when p_sort = 'newest' then f.created_at end desc,
      case when p_sort = 'oldest' then f.id end asc,
      case when p_sort = 'newest' then f.id end desc
    limit p_limit
    offset p_offset
  ),
  paged as (
    select
      p.*,
      coalesce(a.open_attention_count, 0) as open_attention_count,
      a.open_attention_severity
    from paged_base p
    left join lateral (
      select
        count(*)::integer as open_attention_count,
        case max(
          case af.severity
            when 'critical' then 3
            when 'warning' then 2
            when 'info' then 1
            else 0
          end
        )
          when 3 then 'critical'
          when 2 then 'warning'
          when 1 then 'info'
          else null
        end as open_attention_severity
      from public.order_attention_flags af
      where af.order_id = p.id
        and af.resolved_at is null
    ) a on true
  )
  select jsonb_build_object(
    'orders', coalesce(
      (
        select jsonb_agg(
          to_jsonb(p)
          order by
            case when p_sort = 'oldest' then p.created_at end asc,
            case when p_sort = 'newest' then p.created_at end desc,
            case when p_sort = 'oldest' then p.id end asc,
            case when p_sort = 'newest' then p.id end desc
        )
        from paged p
      ),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtered)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_list_orders(text,text,text,boolean,date,date,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.admin_list_orders(text,text,text,boolean,date,date,text,integer,integer)
  to service_role;

create or replace function public.admin_transition_order_fulfillment(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_previous_status text;
  v_action text;
  v_transition_valid boolean := false;
begin
  if p_admin_user_id is null then
    raise exception 'admin user id is required';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    return jsonb_build_object(
      'outcome', 'not_found',
      'order_id', null,
      'order_number', null,
      'payment_status', null,
      'previous_fulfillment_status', null,
      'fulfillment_status', null
    );
  end if;

  v_previous_status := v_order.fulfillment_status;

  if v_previous_status = p_target_status then
    return jsonb_build_object(
      'outcome', 'unchanged',
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'payment_status', v_order.payment_status,
      'previous_fulfillment_status', v_previous_status,
      'fulfillment_status', v_order.fulfillment_status
    );
  end if;

  if v_previous_status = 'awaiting_payment' and p_target_status = 'canceled' then
    v_transition_valid := true;
  elsif v_previous_status = 'awaiting_production'
        and p_target_status in ('in_production', 'canceled') then
    v_transition_valid := true;
  elsif v_previous_status = 'in_production'
        and p_target_status in ('ready_to_ship', 'canceled') then
    v_transition_valid := true;
  elsif v_previous_status = 'ready_to_ship'
        and p_target_status in ('shipped', 'canceled') then
    v_transition_valid := true;
  elsif v_previous_status = 'shipped' and p_target_status = 'completed' then
    v_transition_valid := true;
  end if;

  if not v_transition_valid then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'payment_status', v_order.payment_status,
      'previous_fulfillment_status', v_previous_status,
      'fulfillment_status', v_order.fulfillment_status
    );
  end if;

  if v_previous_status = 'awaiting_production'
     and p_target_status = 'in_production'
     and v_order.payment_status is distinct from 'approved' then
    return jsonb_build_object(
      'outcome', 'payment_precondition_failed',
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'payment_status', v_order.payment_status,
      'previous_fulfillment_status', v_previous_status,
      'fulfillment_status', v_order.fulfillment_status
    );
  end if;

  v_action := case p_target_status
    when 'in_production' then 'production_started'
    when 'ready_to_ship' then 'marked_ready_to_ship'
    when 'shipped' then 'marked_shipped'
    when 'completed' then 'marked_completed'
    when 'canceled' then 'order_canceled'
    else null
  end;

  if v_action is null then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'payment_status', v_order.payment_status,
      'previous_fulfillment_status', v_previous_status,
      'fulfillment_status', v_order.fulfillment_status
    );
  end if;

  update public.orders
     set fulfillment_status = p_target_status
   where id = v_order.id
   returning * into v_order;

  insert into public.order_events (
    order_id,
    event_type,
    source,
    dedupe_key,
    metadata
  )
  values (
    v_order.id,
    'fulfillment_status_changed',
    'admin',
    'admin-fulfillment:' || v_order.id::text || ':' || v_previous_status || ':' || p_target_status,
    jsonb_build_object(
      'from', v_previous_status,
      'to', p_target_status
    )
  )
  on conflict (dedupe_key) do nothing;

  insert into public.admin_audit_log (
    admin_user_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values,
    metadata
  )
  values (
    p_admin_user_id,
    'order',
    v_order.id::text,
    v_action,
    jsonb_build_object('fulfillment_status', v_previous_status),
    jsonb_build_object('fulfillment_status', p_target_status),
    '{}'::jsonb
  );

  if p_target_status = 'canceled' and v_order.payment_status = 'approved' then
    insert into public.order_attention_flags (
      order_id,
      code,
      severity,
      source,
      metadata
    )
    values (
      v_order.id,
      'canceled_paid_order',
      'critical',
      'admin',
      jsonb_build_object('payment_status', v_order.payment_status)
    )
    on conflict (order_id, code) where resolved_at is null do nothing;
  end if;

  return jsonb_build_object(
    'outcome', 'transitioned',
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'payment_status', v_order.payment_status,
    'previous_fulfillment_status', v_previous_status,
    'fulfillment_status', v_order.fulfillment_status
  );
end;
$$;

revoke all on function public.admin_transition_order_fulfillment(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_transition_order_fulfillment(uuid,uuid,text)
  to service_role;

create or replace function public.resolve_canceled_paid_order_attention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status is distinct from old.payment_status
     and new.payment_status in ('refunded', 'charged_back') then
    update public.order_attention_flags
       set resolved_at = coalesce(resolved_at, now())
     where order_id = new.id
       and code = 'canceled_paid_order'
       and resolved_at is null;
  end if;

  return new;
end;
$$;

revoke all on function public.resolve_canceled_paid_order_attention()
  from public, anon, authenticated;
grant execute on function public.resolve_canceled_paid_order_attention()
  to service_role;

drop trigger if exists resolve_canceled_paid_order_attention_after_reversal
  on public.orders;
create trigger resolve_canceled_paid_order_attention_after_reversal
  after update of payment_status on public.orders
  for each row
  execute function public.resolve_canceled_paid_order_attention();
