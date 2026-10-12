-- Az No as a number, only for sorting: 9 comes before 10.
-- The database calculates it from az_no; nobody writes it. Values that are not only digits give null,
-- so the app sorts them after the numbers, by az_no. Up to 18 digits always fit in a bigint.
-- The existing select grant and "Users see machines in their company" policy cover the new column.
alter table public.machines
  add column az_no_number bigint
  generated always as (case when az_no ~ '^[0-9]{1,18}$' then az_no::bigint end) stored;
