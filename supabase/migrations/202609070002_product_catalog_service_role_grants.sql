revoke all on table public.products from public, anon, authenticated;
grant select, insert, update on table public.products to service_role;

revoke all on sequence public.products_id_seq from public, anon, authenticated;
grant usage on sequence public.products_id_seq to service_role;
