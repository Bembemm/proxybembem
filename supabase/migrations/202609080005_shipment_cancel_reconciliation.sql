create or replace function public.admin_resolve_shipment_reconciliation(
  p_shipment_id uuid,
  p_admin_user_id uuid,
  p_expected_version bigint,
  p_resolution text,
  p_provider_order_id text,
  p_purchased_cost_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
  v_previous text;
  v_target text;
begin
  if p_admin_user_id is null
     or p_expected_version is null
     or p_expected_version <= 0
     or p_resolution not in ('purchased','not_purchased','canceled','not_canceled')
     or (
       p_resolution='purchased'
       and (
         p_provider_order_id is null
         or pg_catalog.char_length(p_provider_order_id) not between 1 and 128
         or p_purchased_cost_cents is null
         or p_purchased_cost_cents < 0
       )
     )
     or (
       p_resolution<>'purchased'
       and (p_provider_order_id is not null or p_purchased_cost_cents is not null)
     )
  then
    raise exception 'invalid shipment reconciliation';
  end if;

  select *
    into v_shipment
    from public.shipments
   where id=p_shipment_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'outcome','not_found','shipment_id',null,'order_id',null,
      'previous_state',null,'state',null,'version',null
    );
  end if;

  if v_shipment.version<>p_expected_version then
    return pg_catalog.jsonb_build_object(
      'outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,
      'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version
    );
  end if;

  v_previous:=v_shipment.state;

  if p_resolution in ('purchased','not_purchased') then
    if v_shipment.state<>'attention_required'
       or v_shipment.attention_reason<>'purchase_outcome_unknown'
       or v_shipment.stable_state_before_attention<>'in_cart'
       or v_shipment.operation_kind is not null
       or v_shipment.operation_id is not null
    then
      return pg_catalog.jsonb_build_object(
        'outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,
        'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version
      );
    end if;

    v_target:=case p_resolution
      when 'purchased' then 'purchased'
      when 'not_purchased' then 'in_cart'
    end;
  else
    if v_shipment.stable_state_before_attention not in ('purchased','generated')
       or not (
         (
           v_shipment.state='cancel_pending'
           and v_shipment.operation_kind='cancel'
           and v_shipment.operation_id is not null
           and v_shipment.attention_reason is null
         )
         or (
           v_shipment.state='attention_required'
           and v_shipment.attention_reason='cancel_outcome_unknown'
           and v_shipment.operation_kind is null
           and v_shipment.operation_id is null
         )
       )
    then
      return pg_catalog.jsonb_build_object(
        'outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,
        'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version
      );
    end if;

    v_target:=case p_resolution
      when 'canceled' then 'canceled'
      when 'not_canceled' then v_shipment.stable_state_before_attention
    end;
  end if;

  update public.shipments
     set state=v_target,
         provider_order_id=case
           when p_resolution='purchased' then p_provider_order_id
           else provider_order_id
         end,
         purchased_cost_cents=case
           when p_resolution='purchased' then p_purchased_cost_cents
           else purchased_cost_cents
         end,
         stable_state_before_attention=null,
         attention_reason=null,
         operation_kind=null,
         operation_id=null,
         version=version+1,
         updated_at=pg_catalog.now()
   where id=v_shipment.id
  returning * into v_shipment;

  insert into public.shipment_events (
    shipment_id,order_id,event_type,source,dedupe_key,metadata
  ) values (
    v_shipment.id,
    v_shipment.order_id,
    'shipment_reconciled',
    'admin',
    'reconcile:'||v_shipment.version::text,
    pg_catalog.jsonb_build_object('resolution',p_resolution,'state',v_target)
  )
  on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;

  insert into public.admin_audit_log (
    admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata
  ) values (
    p_admin_user_id,
    'shipment',
    v_shipment.id::text,
    'shipment_reconciled',
    pg_catalog.jsonb_build_object(
      'state',v_previous,
      'attention_reason',case
        when v_previous='attention_required' then
          case
            when p_resolution in ('purchased','not_purchased') then 'purchase_outcome_unknown'
            else 'cancel_outcome_unknown'
          end
        else null
      end
    ),
    pg_catalog.jsonb_build_object('state',v_target,'version',v_shipment.version),
    pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'resolution',p_resolution,
        'purchased_cost_cents',case
          when p_resolution='purchased' then p_purchased_cost_cents
          else null
        end
      )
    )
  );

  return pg_catalog.jsonb_build_object(
    'outcome','transitioned',
    'shipment_id',v_shipment.id,
    'order_id',v_shipment.order_id,
    'previous_state',v_previous,
    'state',v_target,
    'version',v_shipment.version
  );
end;
$$;

revoke all on function public.admin_resolve_shipment_reconciliation(uuid,uuid,bigint,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.admin_resolve_shipment_reconciliation(uuid,uuid,bigint,text,text,integer)
  to service_role;
