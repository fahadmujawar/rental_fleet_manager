-- 1. Reusable trigger function: stamps updated_at on every update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Companies table
create table public.companies (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null check (name ~ '^\S(.*\S)?$' and name !~ '[[:cntrl:]]' and char_length(name) <= 200),
  short_code       text        not null unique check (short_code ~ '^[A-Z0-9]{2,10}$'),
  default_language text        not null default 'en',
  timezone         text        not null default 'Asia/Riyadh',
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 3. Attach trigger
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

-- 4. Row Level Security
alter table public.companies enable row level security;

-- 5. Access: read-only for logged-in users, nothing for anyone else
revoke all on public.companies from anon, authenticated;
grant select on public.companies to authenticated;
