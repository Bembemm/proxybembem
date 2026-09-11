alter table public.orders
  add column customer_cpf text;

alter table public.orders
  add constraint orders_customer_cpf_format
  check (
    customer_cpf is null
    or customer_cpf ~ '^[0-9]{11}$'
  );

comment on column public.orders.customer_cpf is
  'Recipient CPF used server-side for carrier shipment preparation. Nullable for legacy orders.';
