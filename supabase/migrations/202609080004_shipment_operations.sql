create or replace function public.admin_create_shipment_draft(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_sender_profile_id uuid,
  p_sender_profile_version bigint,
  p_environment text,
  p_service_id text,
  p_service_name text,
  p_carrier_name text,
  p_customer_shipping_cents integer,
  p_recipient_snapshot jsonb,
  p_sender_snapshot jsonb,
  p_package_snapshot jsonb,
  p_declaration_items_snapshot jsonb,
  p_document_mode text default 'declaration_content',
  p_invoice_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_sender public.shipping_sender_profiles%rowtype;
  v_shipment public.shipments%rowtype;
  v_existing public.shipments%rowtype;
  v_constraint text;
begin
  if p_admin_user_id is null
     or p_order_id is null
     or p_sender_profile_id is null
     or p_sender_profile_version is null
     or p_sender_profile_version <= 0
     or p_environment not in ('sandbox', 'production')
     or p_document_mode not in ('declaration_content', 'invoice')
     or p_service_id is null or pg_catalog.char_length(p_service_id) not between 1 and 64
     or p_service_name is null or pg_catalog.char_length(p_service_name) not between 1 and 120
     or p_carrier_name is null or pg_catalog.char_length(p_carrier_name) not between 1 and 120
     or p_customer_shipping_cents is null or p_customer_shipping_cents < 0
     or p_recipient_snapshot is null or pg_catalog.jsonb_typeof(p_recipient_snapshot) <> 'object'
     or p_sender_snapshot is null or pg_catalog.jsonb_typeof(p_sender_snapshot) <> 'object'
     or p_package_snapshot is null or pg_catalog.jsonb_typeof(p_package_snapshot) <> 'object'
     or p_declaration_items_snapshot is null
     or pg_catalog.jsonb_typeof(p_declaration_items_snapshot) <> 'array'
     or pg_catalog.jsonb_array_length(p_declaration_items_snapshot) < 1
     or (p_document_mode = 'declaration_content' and p_invoice_key is not null)
     or (p_document_mode = 'invoice' and (p_invoice_key is null or p_invoice_key !~ '^\d{44}$'))
  then
    raise exception 'invalid shipment draft input';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'outcome', 'not_found', 'shipment_id', null, 'order_id', null,
      'previous_state', null, 'state', null, 'version', null
    );
  end if;

  if v_order.payment_status is distinct from 'approved'
     or v_order.fulfillment_status is distinct from 'ready_to_ship' then
    return pg_catalog.jsonb_build_object(
      'outcome', 'invalid_state', 'shipment_id', v_order.id, 'order_id', v_order.id,
      'previous_state', null, 'state', 'draft', 'version', 1
    );
  end if;

  select *
    into v_sender
    from public.shipping_sender_profiles
   where id = p_sender_profile_id
   for update;

  if not found
     or v_sender.version <> p_sender_profile_version
     or v_sender.environment <> p_environment
     or (p_document_mode = 'declaration_content' and v_sender.person_type <> 'pf')
     or (p_document_mode = 'invoice' and v_sender.person_type <> 'pj') then
    return pg_catalog.jsonb_build_object(
      'outcome', 'conflict', 'shipment_id', p_sender_profile_id, 'order_id', v_order.id,
      'previous_state', null, 'state', 'draft', 'version', 1
    );
  end if;

  select *
    into v_existing
    from public.shipments
   where order_id = v_order.id
     and state <> 'canceled'
   order by created_at desc
   limit 1
   for update;

  if found then
    return pg_catalog.jsonb_build_object(
      'outcome', 'active_exists', 'shipment_id', v_existing.id, 'order_id', v_existing.order_id,
      'previous_state', v_existing.state, 'state', v_existing.state, 'version', v_existing.version
    );
  end if;

  begin
    insert into public.shipments (
      order_id,
      sender_profile_id,
      sender_profile_version,
      provider,
      environment,
      document_mode,
      invoice_key,
      state,
      service_id,
      service_name,
      carrier_name,
      customer_shipping_cents,
      recipient_snapshot,
      sender_snapshot,
      package_snapshot,
      declaration_items_snapshot,
      version
    ) values (
      v_order.id,
      v_sender.id,
      v_sender.version,
      'melhor_envio',
      p_environment,
      p_document_mode,
      p_invoice_key,
      'draft',
      p_service_id,
      p_service_name,
      p_carrier_name,
      p_customer_shipping_cents,
      p_recipient_snapshot,
      p_sender_snapshot,
      p_package_snapshot,
      p_declaration_items_snapshot,
      1
    ) returning * into v_shipment;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'shipments_one_active_per_order_uidx' then
      select *
        into v_existing
        from public.shipments
       where order_id = v_order.id
         and state <> 'canceled'
       order by created_at desc
       limit 1;
      return pg_catalog.jsonb_build_object(
        'outcome', 'active_exists', 'shipment_id', v_existing.id, 'order_id', v_order.id,
        'previous_state', v_existing.state, 'state', v_existing.state, 'version', v_existing.version
      );
    end if;
    raise;
  end;

  insert into public.shipment_events (
    shipment_id, order_id, event_type, source, dedupe_key, metadata
  ) values (
    v_shipment.id, v_shipment.order_id, 'shipment_draft_created', 'admin',
    'draft:' || v_shipment.id::text,
    pg_catalog.jsonb_build_object(
      'state', 'draft',
      'environment', v_shipment.environment,
      'document_mode', v_shipment.document_mode,
      'sender_profile_version', v_shipment.sender_profile_version
    )
  ) on conflict (shipment_id, dedupe_key) where dedupe_key is not null do nothing;

  insert into public.admin_audit_log (
    admin_user_id, entity_type, entity_id, action, previous_values, new_values, metadata
  ) values (
    p_admin_user_id, 'shipment', v_shipment.id::text, 'shipment_draft_created', null,
    pg_catalog.jsonb_build_object('state', 'draft', 'version', v_shipment.version),
    pg_catalog.jsonb_build_object(
      'order_id', v_shipment.order_id,
      'environment', v_shipment.environment,
      'document_mode', v_shipment.document_mode,
      'sender_profile_id', v_shipment.sender_profile_id,
      'sender_profile_version', v_shipment.sender_profile_version
    )
  );

  return pg_catalog.jsonb_build_object(
    'outcome', 'created', 'shipment_id', v_shipment.id, 'order_id', v_shipment.order_id,
    'previous_state', null, 'state', v_shipment.state, 'version', v_shipment.version
  );
end;
$$;

revoke all on function public.admin_create_shipment_draft(
  uuid, uuid, uuid, bigint, text, text, text, text, integer, jsonb, jsonb, jsonb, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.admin_create_shipment_draft(
  uuid, uuid, uuid, bigint, text, text, text, text, integer, jsonb, jsonb, jsonb, jsonb, text, text
) to service_role;

create or replace function public.admin_claim_shipment_prepare(
  p_shipment_id uuid,
  p_admin_user_id uuid,
  p_expected_version bigint,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
  v_previous text;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version <= 0 then
    raise exception 'invalid shipment prepare claim';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null);
  end if;
  if v_shipment.version <> p_expected_version then
    return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version);
  end if;
  if v_shipment.operation_kind is not null then
    if v_shipment.operation_kind = 'prepare' and v_shipment.operation_id = p_operation_id and v_shipment.state = 'prepared' then
      return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version);
    end if;
    return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version);
  end if;
  if v_shipment.state not in ('draft','prepared') then
    return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version);
  end if;

  v_previous := v_shipment.state;
  update public.shipments
     set state = 'prepared', operation_kind = 'prepare', operation_id = p_operation_id,
         version = version + 1, updated_at = pg_catalog.now()
   where id = v_shipment.id
   returning * into v_shipment;

  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata)
  values (v_shipment.id,v_shipment.order_id,'shipment_prepare_claimed','admin','prepare-claim:'||p_operation_id::text,pg_catalog.jsonb_build_object('from',v_previous,'to','prepared'))
  on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;

  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata)
  values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_prepare_claimed',pg_catalog.jsonb_build_object('state',v_previous),pg_catalog.jsonb_build_object('state','prepared','version',v_shipment.version),pg_catalog.jsonb_build_object('operation_id',p_operation_id));

  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_previous,'state',v_shipment.state,'version',v_shipment.version);
end;
$$;
revoke all on function public.admin_claim_shipment_prepare(uuid,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_shipment_prepare(uuid,uuid,bigint,uuid) to service_role;

create or replace function public.admin_commit_shipment_cart(
  p_shipment_id uuid,
  p_admin_user_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_provider_cart_id text,
  p_provider_shipment_id text,
  p_provider_cost_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version <= 0
     or p_provider_cart_id is null or pg_catalog.char_length(p_provider_cart_id) not between 1 and 128
     or p_provider_shipment_id is null or pg_catalog.char_length(p_provider_shipment_id) not between 1 and 128
     or p_provider_cost_cents is null or p_provider_cost_cents < 0 then
    raise exception 'invalid shipment cart commit';
  end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version <> p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind <> 'prepare' or v_shipment.operation_id is distinct from p_operation_id then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state <> 'prepared' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;

  update public.shipments
     set state='in_cart', provider_cart_id=p_provider_cart_id, provider_shipment_id=p_provider_shipment_id,
         provider_cost_cents=p_provider_cost_cents, operation_kind=null, operation_id=null,
         version=version+1, updated_at=pg_catalog.now()
   where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata)
  values (v_shipment.id,v_shipment.order_id,'shipment_added_to_cart','melhor_envio','cart:'||p_operation_id::text,pg_catalog.jsonb_build_object('state','in_cart','provider_cost_cents',p_provider_cost_cents))
  on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata)
  values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_cart_committed',pg_catalog.jsonb_build_object('state','prepared'),pg_catalog.jsonb_build_object('state','in_cart','version',v_shipment.version),pg_catalog.jsonb_build_object('operation_id',p_operation_id,'provider_cost_cents',p_provider_cost_cents));
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','prepared','state',v_shipment.state,'version',v_shipment.version);
end;
$$;
revoke all on function public.admin_commit_shipment_cart(uuid,uuid,bigint,uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.admin_commit_shipment_cart(uuid,uuid,bigint,uuid,text,text,integer) to service_role;

create or replace function public.admin_revert_shipment_prepare(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version <= 0 then raise exception 'invalid shipment prepare revert'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version <> p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind <> 'prepare' or v_shipment.operation_id is distinct from p_operation_id then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state <> 'prepared' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  update public.shipments set operation_kind=null,operation_id=null,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_prepare_reverted','admin','prepare-revert:'||p_operation_id::text,pg_catalog.jsonb_build_object('state','prepared')) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','prepared','state','prepared','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_revert_shipment_prepare(uuid,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_revert_shipment_prepare(uuid,uuid,bigint,uuid) to service_role;

create or replace function public.admin_claim_shipment_purchase(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version <= 0 then raise exception 'invalid shipment purchase claim'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version <> p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind is not null then
    if v_shipment.operation_kind='purchase' and v_shipment.operation_id=p_operation_id and v_shipment.state='purchase_pending' then return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','in_cart','state',v_shipment.state,'version',v_shipment.version); end if;
    return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version);
  end if;
  if v_shipment.state <> 'in_cart' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  update public.shipments set state='purchase_pending',operation_kind='purchase',operation_id=p_operation_id,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_purchase_claimed','admin','purchase-claim:'||p_operation_id::text,pg_catalog.jsonb_build_object('from','in_cart','to','purchase_pending')) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata) values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_purchase_claimed',pg_catalog.jsonb_build_object('state','in_cart'),pg_catalog.jsonb_build_object('state','purchase_pending','version',v_shipment.version),pg_catalog.jsonb_build_object('operation_id',p_operation_id));
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','in_cart','state','purchase_pending','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_claim_shipment_purchase(uuid,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_shipment_purchase(uuid,uuid,bigint,uuid) to service_role;

create or replace function public.admin_commit_shipment_purchase(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid,
  p_provider_order_id text, p_purchased_cost_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version <= 0 or p_provider_order_id is null or pg_catalog.char_length(p_provider_order_id) not between 1 and 128 or p_purchased_cost_cents is null or p_purchased_cost_cents < 0 then raise exception 'invalid shipment purchase commit'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version <> p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind <> 'purchase' or v_shipment.operation_id is distinct from p_operation_id then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state <> 'purchase_pending' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  update public.shipments set state='purchased',provider_order_id=p_provider_order_id,purchased_cost_cents=p_purchased_cost_cents,operation_kind=null,operation_id=null,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_purchased','melhor_envio','purchase:'||p_operation_id::text,pg_catalog.jsonb_build_object('state','purchased','purchased_cost_cents',p_purchased_cost_cents)) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata) values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_purchase_committed',pg_catalog.jsonb_build_object('state','purchase_pending'),pg_catalog.jsonb_build_object('state','purchased','version',v_shipment.version),pg_catalog.jsonb_build_object('operation_id',p_operation_id,'purchased_cost_cents',p_purchased_cost_cents));
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','purchase_pending','state','purchased','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_commit_shipment_purchase(uuid,uuid,bigint,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.admin_commit_shipment_purchase(uuid,uuid,bigint,uuid,text,integer) to service_role;

create or replace function public.admin_revert_shipment_purchase(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version <= 0 then raise exception 'invalid shipment purchase revert'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version <> p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind <> 'purchase' or v_shipment.operation_id is distinct from p_operation_id then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state <> 'purchase_pending' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  update public.shipments set state='in_cart',operation_kind=null,operation_id=null,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_purchase_reverted','admin','purchase-revert:'||p_operation_id::text,pg_catalog.jsonb_build_object('from','purchase_pending','to','in_cart')) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','purchase_pending','state','in_cart','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_revert_shipment_purchase(uuid,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_revert_shipment_purchase(uuid,uuid,bigint,uuid) to service_role;

create or replace function public.admin_mark_shipment_attention(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
  v_previous text;
  v_stable text;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version <= 0 or p_reason not in ('purchase_outcome_unknown','cart_outcome_unknown','cancel_outcome_unknown') then raise exception 'invalid shipment attention input'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version <> p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_id is distinct from p_operation_id then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;

  if p_reason='purchase_outcome_unknown' and v_shipment.state='purchase_pending' and v_shipment.operation_kind='purchase' then v_stable:='in_cart';
  elsif p_reason='cart_outcome_unknown' and v_shipment.state='prepared' and v_shipment.operation_kind='prepare' then v_stable:='prepared';
  elsif p_reason='cancel_outcome_unknown' and v_shipment.state='cancel_pending' and v_shipment.operation_kind='cancel' then v_stable:=v_shipment.stable_state_before_attention;
  else return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version);
  end if;
  if v_stable is null then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;

  v_previous:=v_shipment.state;
  update public.shipments set state='attention_required',stable_state_before_attention=v_stable,attention_reason=p_reason,operation_kind=null,operation_id=null,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_attention_required','system','attention:'||p_reason||':'||v_shipment.version::text,pg_catalog.jsonb_build_object('reason',p_reason,'stable_state',v_stable)) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata) values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_attention_marked',pg_catalog.jsonb_build_object('state',v_previous),pg_catalog.jsonb_build_object('state','attention_required','version',v_shipment.version),pg_catalog.jsonb_build_object('reason',p_reason));
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_previous,'state','attention_required','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_mark_shipment_attention(uuid,uuid,bigint,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_mark_shipment_attention(uuid,uuid,bigint,uuid,text) to service_role;

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
  v_target text;
begin
  if p_admin_user_id is null or p_expected_version is null or p_expected_version <= 0 or p_resolution not in ('purchased','not_purchased')
     or (p_resolution='purchased' and (p_provider_order_id is null or pg_catalog.char_length(p_provider_order_id) not between 1 and 128 or p_purchased_cost_cents is null or p_purchased_cost_cents < 0))
     or (p_resolution='not_purchased' and (p_provider_order_id is not null or p_purchased_cost_cents is not null)) then raise exception 'invalid shipment reconciliation'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version <> p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state <> 'attention_required' or v_shipment.attention_reason <> 'purchase_outcome_unknown' or v_shipment.stable_state_before_attention <> 'in_cart' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;

  v_target:=case p_resolution when 'purchased' then 'purchased' when 'not_purchased' then 'in_cart' end;
  update public.shipments set state=v_target,provider_order_id=case when p_resolution='purchased' then p_provider_order_id else provider_order_id end,purchased_cost_cents=case when p_resolution='purchased' then p_purchased_cost_cents else purchased_cost_cents end,stable_state_before_attention=null,attention_reason=null,operation_kind=null,operation_id=null,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_reconciled','admin','reconcile:'||v_shipment.version::text,pg_catalog.jsonb_build_object('resolution',p_resolution,'state',v_target)) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata) values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_reconciled',pg_catalog.jsonb_build_object('state','attention_required','attention_reason','purchase_outcome_unknown'),pg_catalog.jsonb_build_object('state',v_target,'version',v_shipment.version),pg_catalog.jsonb_build_object('resolution',p_resolution,'purchased_cost_cents',p_purchased_cost_cents));
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','attention_required','state',v_target,'version',v_shipment.version);
end;
$$;
revoke all on function public.admin_resolve_shipment_reconciliation(uuid,uuid,bigint,text,text,integer) from public, anon, authenticated;
grant execute on function public.admin_resolve_shipment_reconciliation(uuid,uuid,bigint,text,text,integer) to service_role;

create or replace function public.admin_claim_shipment_generation(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version <= 0 then raise exception 'invalid shipment generation claim'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version<>p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind is not null then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state<>'purchased' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  update public.shipments set state='generation_pending',operation_kind='generation',operation_id=p_operation_id,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_generation_claimed','admin','generation-claim:'||p_operation_id::text,pg_catalog.jsonb_build_object('from','purchased','to','generation_pending')) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','purchased','state','generation_pending','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_claim_shipment_generation(uuid,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_shipment_generation(uuid,uuid,bigint,uuid) to service_role;

create or replace function public.admin_commit_shipment_generation(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version<=0 then raise exception 'invalid shipment generation commit'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version<>p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind<>'generation' or v_shipment.operation_id is distinct from p_operation_id then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state<>'generation_pending' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  update public.shipments set state='generated',operation_kind=null,operation_id=null,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_generated','melhor_envio','generation:'||p_operation_id::text,pg_catalog.jsonb_build_object('from','generation_pending','to','generated')) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','generation_pending','state','generated','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_commit_shipment_generation(uuid,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_commit_shipment_generation(uuid,uuid,bigint,uuid) to service_role;

create or replace function public.admin_claim_shipment_cancel(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype; v_previous text;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version<=0 then raise exception 'invalid shipment cancel claim'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version<>p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind is not null then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state not in ('purchased','generated') then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  v_previous:=v_shipment.state;
  update public.shipments set state='cancel_pending',stable_state_before_attention=v_previous,operation_kind='cancel',operation_id=p_operation_id,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_cancel_claimed','admin','cancel-claim:'||p_operation_id::text,pg_catalog.jsonb_build_object('from',v_previous,'to','cancel_pending')) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata) values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_cancel_claimed',pg_catalog.jsonb_build_object('state',v_previous),pg_catalog.jsonb_build_object('state','cancel_pending','version',v_shipment.version),pg_catalog.jsonb_build_object('operation_id',p_operation_id));
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_previous,'state','cancel_pending','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_claim_shipment_cancel(uuid,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_shipment_cancel(uuid,uuid,bigint,uuid) to service_role;

create or replace function public.admin_commit_shipment_cancel(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint, p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype;
begin
  if p_admin_user_id is null or p_operation_id is null or p_expected_version is null or p_expected_version<=0 then raise exception 'invalid shipment cancel commit'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version<>p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind<>'cancel' or v_shipment.operation_id is distinct from p_operation_id then return pg_catalog.jsonb_build_object('outcome','operation_mismatch','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state<>'cancel_pending' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  update public.shipments set state='canceled',stable_state_before_attention=null,attention_reason=null,operation_kind=null,operation_id=null,version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_canceled','melhor_envio','cancel:'||p_operation_id::text,pg_catalog.jsonb_build_object('from','cancel_pending','to','canceled')) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata) values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_cancel_committed',pg_catalog.jsonb_build_object('state','cancel_pending'),pg_catalog.jsonb_build_object('state','canceled','version',v_shipment.version),pg_catalog.jsonb_build_object('operation_id',p_operation_id));
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','cancel_pending','state','canceled','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_commit_shipment_cancel(uuid,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_commit_shipment_cancel(uuid,uuid,bigint,uuid) to service_role;

create or replace function public.admin_confirm_shipment_posting(
  p_shipment_id uuid, p_admin_user_id uuid, p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_shipment public.shipments%rowtype; v_order public.orders%rowtype;
begin
  if p_admin_user_id is null or p_expected_version is null or p_expected_version<=0 then raise exception 'invalid shipment posting'; end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version<>p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.state<>'generated' or v_shipment.operation_kind is not null then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  select * into v_order from public.orders where id=v_shipment.order_id for update;
  if not found or v_order.fulfillment_status<>'ready_to_ship' then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  update public.shipments set state='posted',version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;
  update public.orders set fulfillment_status='shipped' where id=v_order.id and fulfillment_status='ready_to_ship';
  insert into public.order_events (order_id,event_type,source,dedupe_key,metadata) values (v_order.id,'fulfillment_status_changed','shipment','shipment-posted:'||v_shipment.id::text,pg_catalog.jsonb_build_object('from','ready_to_ship','to','shipped')) on conflict (dedupe_key) do nothing;
  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata) values (v_shipment.id,v_shipment.order_id,'shipment_posted','admin','posted:'||v_shipment.version::text,pg_catalog.jsonb_build_object('state','posted')) on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.admin_audit_log (admin_user_id,entity_type,entity_id,action,previous_values,new_values,metadata) values (p_admin_user_id,'shipment',v_shipment.id::text,'shipment_posting_confirmed',pg_catalog.jsonb_build_object('state','generated'),pg_catalog.jsonb_build_object('state','posted','version',v_shipment.version),pg_catalog.jsonb_build_object('order_fulfillment_status','shipped'));
  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state','generated','state','posted','version',v_shipment.version);
end;
$$;
revoke all on function public.admin_confirm_shipment_posting(uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.admin_confirm_shipment_posting(uuid,uuid,bigint) to service_role;

create or replace function public.shipment_apply_tracking_update(
  p_shipment_id uuid,
  p_expected_version bigint,
  p_tracking_state text,
  p_provider_status text,
  p_tracking_code text,
  p_event_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments%rowtype;
  v_order public.orders%rowtype;
  v_previous text;
  v_valid boolean := false;
begin
  if p_expected_version is null or p_expected_version<=0
     or p_tracking_state not in ('posted','in_transit','delivered')
     or p_provider_status is null or pg_catalog.char_length(p_provider_status) not between 1 and 128
     or (p_tracking_code is not null and pg_catalog.char_length(p_tracking_code) not between 1 and 128)
     or p_event_fingerprint is null or pg_catalog.char_length(p_event_fingerprint) not between 1 and 120 then raise exception 'invalid shipment tracking update'; end if;

  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome','not_found','shipment_id',null,'order_id',null,'previous_state',null,'state',null,'version',null); end if;
  if v_shipment.version<>p_expected_version then return pg_catalog.jsonb_build_object('outcome','conflict','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;
  if v_shipment.operation_kind is not null or v_shipment.state in ('draft','prepared','in_cart','purchase_pending','generation_pending','cancel_pending','canceled','attention_required') then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;

  if p_tracking_state='posted' and v_shipment.state in ('purchased','generated','posted') then v_valid:=true;
  elsif p_tracking_state='in_transit' and v_shipment.state in ('purchased','generated','posted','in_transit') then v_valid:=true;
  elsif p_tracking_state='delivered' and v_shipment.state in ('purchased','generated','posted','in_transit','delivered') then v_valid:=true;
  end if;
  if not v_valid then return pg_catalog.jsonb_build_object('outcome','invalid_state','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_shipment.state,'state',v_shipment.state,'version',v_shipment.version); end if;

  v_previous:=v_shipment.state;
  update public.shipments set state=p_tracking_state,tracking_code=coalesce(p_tracking_code,tracking_code),provider_status=p_provider_status,last_tracking_sync_at=pg_catalog.now(),version=version+1,updated_at=pg_catalog.now() where id=v_shipment.id returning * into v_shipment;

  insert into public.shipment_events (shipment_id,order_id,event_type,source,dedupe_key,metadata)
  values (v_shipment.id,v_shipment.order_id,'shipment_tracking_updated','melhor_envio','tracking:'||p_event_fingerprint,pg_catalog.jsonb_build_object('from',v_previous,'to',p_tracking_state,'provider_status',p_provider_status))
  on conflict (shipment_id,dedupe_key) where dedupe_key is not null do nothing;

  select * into v_order from public.orders where id=v_shipment.order_id for update;
  if found then
    if p_tracking_state in ('posted','in_transit') and v_order.fulfillment_status='ready_to_ship' then
      update public.orders set fulfillment_status='shipped' where id=v_order.id and fulfillment_status='ready_to_ship';
      insert into public.order_events (order_id,event_type,source,dedupe_key,metadata) values (v_order.id,'fulfillment_status_changed','shipment','tracking-shipped:'||p_event_fingerprint,pg_catalog.jsonb_build_object('from','ready_to_ship','to','shipped')) on conflict (dedupe_key) do nothing;
    elsif p_tracking_state='delivered' and v_order.fulfillment_status='ready_to_ship' then
      update public.orders set fulfillment_status='shipped' where id=v_order.id and fulfillment_status='ready_to_ship';
      insert into public.order_events (order_id,event_type,source,dedupe_key,metadata) values (v_order.id,'fulfillment_status_changed','shipment','tracking-shipped:'||p_event_fingerprint,pg_catalog.jsonb_build_object('from','ready_to_ship','to','shipped')) on conflict (dedupe_key) do nothing;
      update public.orders set fulfillment_status='completed' where id=v_order.id and fulfillment_status='shipped';
      insert into public.order_events (order_id,event_type,source,dedupe_key,metadata) values (v_order.id,'fulfillment_status_changed','shipment','tracking-completed:'||p_event_fingerprint,pg_catalog.jsonb_build_object('from','shipped','to','completed')) on conflict (dedupe_key) do nothing;
    elsif p_tracking_state='delivered' and v_order.fulfillment_status='shipped' then
      update public.orders set fulfillment_status='completed' where id=v_order.id and fulfillment_status='shipped';
      insert into public.order_events (order_id,event_type,source,dedupe_key,metadata) values (v_order.id,'fulfillment_status_changed','shipment','tracking-completed:'||p_event_fingerprint,pg_catalog.jsonb_build_object('from','shipped','to','completed')) on conflict (dedupe_key) do nothing;
    end if;
  end if;

  return pg_catalog.jsonb_build_object('outcome','transitioned','shipment_id',v_shipment.id,'order_id',v_shipment.order_id,'previous_state',v_previous,'state',v_shipment.state,'version',v_shipment.version);
end;
$$;
revoke all on function public.shipment_apply_tracking_update(uuid,bigint,text,text,text,text) from public, anon, authenticated;
grant execute on function public.shipment_apply_tracking_update(uuid,bigint,text,text,text,text) to service_role;
