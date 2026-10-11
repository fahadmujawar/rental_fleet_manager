-- 1. Mark customers that are sister companies
alter table public.customers
  add column is_sister_company boolean not null default false;

-- 2. New permission
insert into public.permissions (code, description) values
  ('checkins.submit', 'Submit daily machine status checkins');

-- 3. Status checkins: one status per machine per day
-- The date window is checked in apply_status_checkin(), not in a CHECK constraint,
-- so that a restore of old rows from a backup does not fail.
create table public.status_checkins (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null,
  machine_id    uuid        not null,
  status_id     uuid        not null,
  checkin_date  date        not null,
  note          text        null check (note ~ '^\S(.*\S)?$' and note !~ '[[:cntrl:]]' and char_length(note) <= 300),
  checked_in_by uuid        not null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (machine_id, checkin_date),
  foreign key (machine_id, company_id) references public.machines(id, company_id),
  foreign key (status_id, company_id) references public.status_values(id, company_id),
  foreign key (checked_in_by, company_id) references public.profiles(id, company_id)
);

create index status_checkins_company_id_checkin_date_idx on public.status_checkins (company_id, checkin_date);
create index status_checkins_status_id_idx on public.status_checkins (status_id);

create trigger status_checkins_set_updated_at
before update on public.status_checkins
for each row execute function public.set_updated_at();

-- 4a. Before a checkin is saved: check it, and record who made the last change
create or replace function public.apply_status_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  machine_active boolean;
  status_active  boolean;
  company_today  date;
begin
  -- Lock the machine row so that two checkins for one machine are applied one after the other.
  select m.is_active into machine_active
  from public.machines m
  where m.id = new.machine_id and m.company_id = new.company_id
  for no key update;

  if machine_active is false then
    raise exception 'machine_inactive';
  end if;

  select s.is_active into status_active
  from public.status_values s
  where s.id = new.status_id and s.company_id = new.company_id;

  if status_active is false then
    raise exception 'status_inactive';
  end if;

  -- "Today" is the date in the company's own time zone, not the server's.
  select (now() at time zone c.timezone)::date into company_today
  from public.companies c
  where c.id = new.company_id;

  if new.checkin_date not between company_today - 7 and company_today then
    raise exception 'checkin_date_out_of_range';
  end if;

  if tg_op = 'UPDATE' then
    new.checked_in_by := coalesce(auth.uid(), old.checked_in_by);
  end if;

  return new;
end;
$$;

create trigger status_checkins_apply_status_checkin
before insert or update on public.status_checkins
for each row execute function public.apply_status_checkin();

-- 4b. After a checkin is saved: copy its status to the machine if it is the latest checkin
create or replace function public.sync_machine_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.machines m
  set status_id = new.status_id
  where m.id = new.machine_id
    and m.status_id is distinct from new.status_id
    and not exists (
      select 1
      from public.status_checkins c
      where c.machine_id = new.machine_id
        and c.checkin_date > new.checkin_date
    );

  return null;
end;
$$;

create trigger status_checkins_sync_machine_status
after insert or update of status_id on public.status_checkins
for each row execute function public.sync_machine_status();

revoke execute on function public.apply_status_checkin() from public, anon, authenticated;
revoke execute on function public.sync_machine_status() from public, anon, authenticated;

-- 5. Row Level Security and policies
alter table public.status_checkins enable row level security;

create policy "Users see checkins in their company"
on public.status_checkins for select to authenticated
using (company_id = (select public.current_company_id()));

create policy "Submitters add their own checkins in their company"
on public.status_checkins for insert to authenticated
with check (
  company_id = (select public.current_company_id())
  and (select public.has_permission('checkins.submit'))
  and checked_in_by = (select auth.uid())
);

create policy "Submitters update checkins in their company"
on public.status_checkins for update to authenticated
using (company_id = (select public.current_company_id()) and (select public.has_permission('checkins.submit')))
with check (company_id = (select public.current_company_id()) and (select public.has_permission('checkins.submit')));

-- 6. Grants: clear defaults, then give exactly what the app needs
revoke all on public.status_checkins from anon, authenticated;

grant select, insert on public.status_checkins to authenticated;
grant update (status_id, note) on public.status_checkins to authenticated;

grant update (is_sister_company) on public.customers to authenticated;
