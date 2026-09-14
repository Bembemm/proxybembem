create table public.store_settings (
  id text primary key check (id = 'default'),
  production_lead_time_business_days integer not null default 5
    check (production_lead_time_business_days between 1 and 15),
  contact_email text
    check (
      contact_email is null
      or (
        pg_catalog.btrim(contact_email) = contact_email
        and pg_catalog.char_length(contact_email) <= 254
        and contact_email !~ '[[:cntrl:]]'
      )
    ),
  contact_whatsapp_e164 text
    check (
      contact_whatsapp_e164 is null
      or contact_whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'
    ),
  notice_enabled boolean not null default false,
  notice_text text
    check (
      notice_text is null
      or (
        pg_catalog.btrim(notice_text) = notice_text
        and pg_catalog.char_length(notice_text) <= 400
        and notice_text !~ '[[:cntrl:]]'
      )
    ),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    not notice_enabled
    or (
      notice_text is not null
      and pg_catalog.btrim(notice_text) <> ''
    )
  )
);

insert into public.store_settings (
  id,
  production_lead_time_business_days,
  contact_email,
  contact_whatsapp_e164,
  notice_enabled,
  notice_text
)
values (
  'default',
  5,
  'contato@proxybembem.com.br',
  '+5544991250332',
  false,
  null
)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;
revoke all on table public.store_settings from public, anon, authenticated;
revoke all on table public.store_settings from service_role;
grant select on table public.store_settings to service_role;

create or replace function public.admin_update_store_settings(
  p_admin_user_id uuid,
  p_expected_updated_at timestamptz,
  p_production_lead_time_business_days integer,
  p_contact_email text,
  p_contact_whatsapp_e164 text,
  p_notice_enabled boolean,
  p_notice_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.store_settings%rowtype;
  v_current public.store_settings%rowtype;
  v_updated_at timestamptz;
begin
  if p_admin_user_id is null then
    raise exception 'admin user id is required';
  end if;

  select *
    into v_previous
    from public.store_settings
   where id = 'default'
   for update;

  if not found then
    raise exception 'store settings singleton is missing';
  end if;

  if p_expected_updated_at is null
     or v_previous.updated_at is distinct from p_expected_updated_at then
    return pg_catalog.jsonb_build_object(
      'outcome', 'conflict',
      'settings', pg_catalog.jsonb_build_object(
        'id', v_previous.id,
        'production_lead_time_business_days', v_previous.production_lead_time_business_days,
        'contact_email', v_previous.contact_email,
        'contact_whatsapp_e164', v_previous.contact_whatsapp_e164,
        'notice_enabled', v_previous.notice_enabled,
        'notice_text', v_previous.notice_text,
        'updated_at', v_previous.updated_at
      )
    );
  end if;

  v_updated_at := pg_catalog.greatest(
    pg_catalog.clock_timestamp(),
    v_previous.updated_at + interval '1 microsecond'
  );

  update public.store_settings
     set production_lead_time_business_days = p_production_lead_time_business_days,
         contact_email = p_contact_email,
         contact_whatsapp_e164 = p_contact_whatsapp_e164,
         notice_enabled = p_notice_enabled,
         notice_text = p_notice_text,
         updated_at = v_updated_at
   where id = 'default'
   returning * into v_current;

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
    'store_settings',
    'default',
    'update_store_settings',
    pg_catalog.jsonb_build_object(
      'production_lead_time_business_days', v_previous.production_lead_time_business_days,
      'contact_email', v_previous.contact_email,
      'contact_whatsapp_e164', v_previous.contact_whatsapp_e164,
      'notice_enabled', v_previous.notice_enabled,
      'notice_text', v_previous.notice_text
    ),
    pg_catalog.jsonb_build_object(
      'production_lead_time_business_days', v_current.production_lead_time_business_days,
      'contact_email', v_current.contact_email,
      'contact_whatsapp_e164', v_current.contact_whatsapp_e164,
      'notice_enabled', v_current.notice_enabled,
      'notice_text', v_current.notice_text
    ),
    '{}'::jsonb
  );

  return pg_catalog.jsonb_build_object(
    'outcome', 'updated',
    'settings', pg_catalog.jsonb_build_object(
      'id', v_current.id,
      'production_lead_time_business_days', v_current.production_lead_time_business_days,
      'contact_email', v_current.contact_email,
      'contact_whatsapp_e164', v_current.contact_whatsapp_e164,
      'notice_enabled', v_current.notice_enabled,
      'notice_text', v_current.notice_text,
      'updated_at', v_current.updated_at
    )
  );
end;
$$;

revoke all on function public.admin_update_store_settings(
  uuid,
  timestamptz,
  integer,
  text,
  text,
  boolean,
  text
) from public, anon, authenticated;

grant execute on function public.admin_update_store_settings(
  uuid,
  timestamptz,
  integer,
  text,
  text,
  boolean,
  text
) to service_role;
