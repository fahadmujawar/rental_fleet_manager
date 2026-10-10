-- 1. Status values: configurable daily status options per company
create table public.status_values (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references public.companies(id),
  code       text        not null check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name_en    text        not null check (name_en ~ '^\S(.*\S)?$' and name_en !~ '[[:cntrl:]]' and char_length(name_en) <= 200),
  name_ar    text        null     check (name_ar ~ '^\S(.*\S)?$' and name_ar !~ '[[:cntrl:]]' and char_length(name_ar) <= 200),
  sort_order integer     not null default 0,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

-- 2. Customers and locations: simple named lists per company
create table public.customers (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references public.companies(id),
  name       text        not null check (name ~ '^\S(.*\S)?$' and name !~ '[[:cntrl:]]' and char_length(name) <= 200),
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create unique index customers_company_id_name_key on public.customers (company_id, lower(name));

create table public.locations (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references public.companies(id),
  name       text        not null check (name ~ '^\S(.*\S)?$' and name !~ '[[:cntrl:]]' and char_length(name) <= 200),
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create unique index locations_company_id_name_key on public.locations (company_id, lower(name));

-- 3. Machines: the fleet register
create table public.machines (
  id               uuid          primary key default gen_random_uuid(),
  company_id       uuid          not null references public.companies(id),
  asset_no         text          not null check (asset_no ~ '^[A-Z0-9][A-Z0-9-]{0,29}$'),
  old_asset_no     text          null check (old_asset_no ~ '^\S(.*\S)?$' and old_asset_no !~ '[[:cntrl:]]' and char_length(old_asset_no) <= 30),
  main_category    text          null check (main_category ~ '^\S(.*\S)?$' and main_category !~ '[[:cntrl:]]' and char_length(main_category) <= 100),
  sub_category     text          null check (sub_category ~ '^\S(.*\S)?$' and sub_category !~ '[[:cntrl:]]' and char_length(sub_category) <= 100),
  sub_category_2   text          null check (sub_category_2 ~ '^\S(.*\S)?$' and sub_category_2 !~ '[[:cntrl:]]' and char_length(sub_category_2) <= 100),
  asset_type       text          null check (asset_type ~ '^\S(.*\S)?$' and asset_type !~ '[[:cntrl:]]' and char_length(asset_type) <= 100),
  manufacturer     text          null check (manufacturer ~ '^\S(.*\S)?$' and manufacturer !~ '[[:cntrl:]]' and char_length(manufacturer) <= 100),
  model            text          null check (model ~ '^\S(.*\S)?$' and model !~ '[[:cntrl:]]' and char_length(model) <= 100),
  description      text          null check (description ~ '^\S(.*\S)?$' and description !~ '[[:cntrl:]]' and char_length(description) <= 300),
  capacity         numeric(12,2) null check (capacity > 0),
  capacity_unit    text          null check (capacity_unit ~ '^\S(.*\S)?$' and capacity_unit !~ '[[:cntrl:]]' and char_length(capacity_unit) <= 100),
  mfg_year         smallint      null check (mfg_year between 1950 and 2100),
  chassis_no       text          null check (chassis_no ~ '^[A-Z0-9][A-Z0-9/.-]{0,39}$'),
  serial_no        text          null check (serial_no ~ '^[A-Z0-9][A-Z0-9/.-]{0,39}$'),
  engine_model     text          null check (engine_model ~ '^\S(.*\S)?$' and engine_model !~ '[[:cntrl:]]' and char_length(engine_model) <= 100),
  engine_no        text          null check (engine_no ~ '^\S(.*\S)?$' and engine_no !~ '[[:cntrl:]]' and char_length(engine_no) <= 100),
  colour           text          null check (colour ~ '^\S(.*\S)?$' and colour !~ '[[:cntrl:]]' and char_length(colour) <= 100),
  plate_no         text          null check (plate_no ~ '^\S(.*\S)?$' and plate_no !~ '[[:cntrl:]]' and char_length(plate_no) <= 100),
  isthimara_expiry date          null,
  warranty_expiry  date          null,
  status_id        uuid          not null,
  customer_id      uuid          null,
  location_id      uuid          null,
  site             text          null check (site ~ '^\S(.*\S)?$' and site !~ '[[:cntrl:]]' and char_length(site) <= 200),
  is_active        boolean       not null default true,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),
  unique (company_id, asset_no),
  unique (company_id, chassis_no),
  unique (company_id, serial_no),
  unique (id, company_id),
  foreign key (status_id, company_id) references public.status_values(id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id),
  foreign key (location_id, company_id) references public.locations(id, company_id)
);

create index machines_status_id_idx on public.machines (status_id);
create index machines_customer_id_idx on public.machines (customer_id);
create index machines_location_id_idx on public.machines (location_id);

-- 4. Keep updated_at current
create trigger status_values_set_updated_at
before update on public.status_values
for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();

create trigger machines_set_updated_at
before update on public.machines
for each row execute function public.set_updated_at();

-- 5. New permissions
insert into public.permissions (code, description) values
  ('machines.manage', 'Add and edit machines'),
  ('lists.manage', 'Edit status values, customers and locations');

-- 6. Row Level Security and policies
alter table public.status_values enable row level security;
alter table public.customers enable row level security;
alter table public.locations enable row level security;
alter table public.machines enable row level security;

-- status_values
create policy "Users see status values in their company"
on public.status_values for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "List managers add status values in their company"
on public.status_values for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')));

create policy "List managers update status values in their company"
on public.status_values for update to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')))
with check (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')));

-- customers
create policy "Users see customers in their company"
on public.customers for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "List managers add customers in their company"
on public.customers for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')));

create policy "List managers update customers in their company"
on public.customers for update to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')))
with check (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')));

-- locations
create policy "Users see locations in their company"
on public.locations for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "List managers add locations in their company"
on public.locations for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')));

create policy "List managers update locations in their company"
on public.locations for update to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')))
with check (company_id = (select public.current_company_id()) and (select public.has_permission('lists.manage')));

-- machines
create policy "Users see machines in their company"
on public.machines for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "Machine managers add machines in their company"
on public.machines for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('machines.manage')));

create policy "Machine managers update machines in their company"
on public.machines for update to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('machines.manage')))
with check (company_id = (select public.current_company_id()) and (select public.has_permission('machines.manage')));

-- 7. Grants: clear defaults, then give exactly what the app needs
revoke all on public.status_values, public.customers, public.locations, public.machines from anon, authenticated;

grant select, insert on public.status_values, public.customers, public.locations, public.machines to authenticated;

grant update (name_en, name_ar, sort_order, is_active) on public.status_values to authenticated;
grant update (name, is_active) on public.customers to authenticated;
grant update (name, is_active) on public.locations to authenticated;
grant update (
  asset_no, old_asset_no, main_category, sub_category, sub_category_2, asset_type,
  manufacturer, model, description, capacity, capacity_unit, mfg_year,
  chassis_no, serial_no, engine_model, engine_no, colour, plate_no,
  isthimara_expiry, warranty_expiry, status_id, customer_id, location_id, site, is_active
) on public.machines to authenticated;
