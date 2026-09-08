revoke all on table public.products from service_role;
grant select, insert, update on table public.products to service_role;

revoke all on sequence public.products_id_seq from service_role;
grant usage on sequence public.products_id_seq to service_role;
