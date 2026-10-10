-- 1. Profiles: one row per login, linked to a company
create table public.profiles (
  id                 uuid        primary key references auth.users(id),
  company_id         uuid        not null references public.companies(id),
  full_name          text        not null check (full_name ~ '^\S(.*\S)?$' and full_name !~ '[[:cntrl:]]' and char_length(full_name) <= 200),
  preferred_language text        null check (preferred_language ~ '^[a-z]{2}$'),
  is_active          boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, company_id)
);

-- 2. Roles: defined per company
create table public.roles (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references public.companies(id),
  code       text        not null check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name       text        not null check (name ~ '^\S(.*\S)?$' and name !~ '[[:cntrl:]]' and char_length(name) <= 100),
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

-- 3. Permissions: global list defined by the app, no company_id
create table public.permissions (
  code        text        primary key check (code ~ '^[a-z_]+(\.[a-z_]+)+$'),
  description text        not null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

insert into public.permissions (code, description) values
  ('users.manage', 'Manage users and their roles'),
  ('roles.manage', 'Manage roles and their permissions');

-- 4. Role permissions: which permissions each role has
create table public.role_permissions (
  company_id      uuid        not null,
  role_id         uuid        not null,
  permission_code text        not null references public.permissions(code),
  created_at      timestamptz not null default now(),
  primary key (role_id, permission_code),
  foreign key (role_id, company_id) references public.roles(id, company_id)
);

-- 5. User roles: which roles each user has
create table public.user_roles (
  company_id uuid        not null,
  user_id    uuid        not null,
  role_id    uuid        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id),
  foreign key (user_id, company_id) references public.profiles(id, company_id),
  foreign key (role_id, company_id) references public.roles(id, company_id)
);

-- 6. Keep updated_at current
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

-- 7. Indexes (roles(company_id) is covered by unique (company_id, code))
create index profiles_company_id_idx on public.profiles (company_id);
create index user_roles_role_id_idx on public.user_roles (role_id);
create index role_permissions_permission_code_idx on public.role_permissions (permission_code);

-- 8. Helper functions used by policies
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pr.company_id
  from public.profiles pr
  join public.companies c on c.id = pr.company_id
  where pr.id = auth.uid()
    and pr.is_active
    and c.is_active;
$$;

create or replace function public.has_permission(p text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.companies c         on c.id = pr.company_id
    join public.user_roles ur       on ur.user_id = pr.id and ur.company_id = pr.company_id
    join public.roles r             on r.id = ur.role_id and r.company_id = pr.company_id
    join public.role_permissions rp on rp.role_id = r.id and rp.company_id = pr.company_id
    join public.permissions pe      on pe.code = rp.permission_code
    where pr.id = auth.uid()
      and pr.is_active
      and c.is_active
      and r.is_active
      and pe.is_active
      and pe.code = p
  );
$$;

revoke execute on function public.current_company_id() from public, anon;
grant execute on function public.current_company_id() to authenticated;

revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

-- 9. Row Level Security and policies
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

-- companies
create policy "Users see their own company"
on public.companies for select to authenticated
using (id = (select public.current_company_id()));

-- profiles
create policy "Users see profiles in their company"
on public.profiles for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "Users update their own active profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()) and is_active and company_id = (select public.current_company_id()))
with check (id = (select auth.uid()) and is_active and company_id = (select public.current_company_id()));

create policy "User managers update profiles in their company"
on public.profiles for update to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('users.manage')))
with check (company_id = (select public.current_company_id()) and (id <> (select auth.uid()) or is_active));

-- roles
create policy "Users see roles in their company"
on public.roles for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "Role managers create roles in their company"
on public.roles for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('roles.manage')));

create policy "Role managers update roles in their company"
on public.roles for update to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('roles.manage')))
with check (company_id = (select public.current_company_id()) and (select public.has_permission('roles.manage')));

-- permissions
create policy "Users see all permissions"
on public.permissions for select to authenticated
using (true);

-- role_permissions
create policy "Users see role permissions in their company"
on public.role_permissions for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "Role managers add role permissions in their company"
on public.role_permissions for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('roles.manage')));

create policy "Role managers remove role permissions in their company"
on public.role_permissions for delete to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('roles.manage')));

-- user_roles
create policy "Users see user roles in their company"
on public.user_roles for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "User managers add user roles in their company"
on public.user_roles for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('users.manage')));

create policy "User managers remove user roles in their company"
on public.user_roles for delete to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('users.manage')));

-- 10. Grants: clear defaults, then give exactly what the app needs
revoke all on public.profiles, public.roles, public.permissions, public.role_permissions, public.user_roles from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, preferred_language, is_active) on public.profiles to authenticated;
grant select, insert on public.roles to authenticated;
grant update (name, is_active) on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;
grant select, insert, delete on public.user_roles to authenticated;
