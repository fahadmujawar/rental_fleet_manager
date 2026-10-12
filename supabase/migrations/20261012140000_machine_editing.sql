-- 1. Roles: Arabic name (shown later in the admin editors)
alter table public.roles
  add column if not exists name_ar text null
  check (name_ar ~ '^\S(.*\S)?$' and name_ar !~ '[[:cntrl:]]' and char_length(name_ar) <= 100);

grant update (name_ar) on public.roles to authenticated;

-- 2. TCS role Operations manager, with permission machines.manage (company_admin keeps it too)
do $$
declare
  tcs_id    uuid;
  v_role_id uuid;
begin
  select id into tcs_id from public.companies where short_code = 'TCS';
  if tcs_id is null then
    raise notice 'Company TCS not found: role operations_manager not created';
    return;
  end if;

  insert into public.roles (company_id, code, name, name_ar)
  values (tcs_id, 'operations_manager', 'Operations manager', 'مدير العمليات')
  on conflict (company_id, code) do nothing;

  select id into v_role_id from public.roles where company_id = tcs_id and code = 'operations_manager';

  insert into public.role_permissions (company_id, role_id, permission_code)
  values (tcs_id, v_role_id, 'machines.manage')
  on conflict do nothing;
end;
$$;

-- 3. Uniqueness the save function relies on. Each is added only if missing (all exist today).
do $$
declare
  dups text;
begin
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.machines'::regclass
      and pg_get_constraintdef(c.oid) = 'UNIQUE (company_id, asset_no)'
  ) then
    select string_agg(asset_no, ', ') into dups
    from (select asset_no from public.machines group by company_id, asset_no having count(*) > 1) d;
    if dups is not null then
      raise exception 'Duplicate asset numbers, constraint not added: %', dups;
    end if;
    alter table public.machines add constraint machines_company_id_asset_no_key unique (company_id, asset_no);
  end if;

  if to_regclass('public.customers_company_id_name_key') is null then
    select string_agg(n, ', ') into dups
    from (select lower(name) n from public.customers group by company_id, lower(name) having count(*) > 1) d;
    if dups is not null then
      raise exception 'Duplicate customer names, index not added: %', dups;
    end if;
    create unique index customers_company_id_name_key on public.customers (company_id, lower(name));
  end if;

  if to_regclass('public.locations_company_id_name_key') is null then
    select string_agg(n, ', ') into dups
    from (select lower(name) n from public.locations group by company_id, lower(name) having count(*) > 1) d;
    if dups is not null then
      raise exception 'Duplicate location names, index not added: %', dups;
    end if;
    create unique index locations_company_id_name_key on public.locations (company_id, lower(name));
  end if;
end;
$$;

-- 4. Machine changes: one row per changed column, written only by the trigger below
create table public.machine_changes (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null,
  machine_id uuid        not null,
  changed_at timestamptz not null default now(),
  changed_by uuid        null,  -- null: no logged in user (for example the import script)
  action     text        not null check (action in ('create', 'update')),
  field      text        not null,
  old_value  text        null,
  new_value  text        null,
  foreign key (machine_id, company_id) references public.machines(id, company_id),
  foreign key (changed_by, company_id) references public.profiles(id, company_id)
);

create index machine_changes_machine_id_changed_at_idx on public.machine_changes (machine_id, changed_at desc);
create index machine_changes_changed_by_idx on public.machine_changes (changed_by);

-- 5. The value to store: status, customer and location ids become their name at the time of the change,
--    so history stays readable after a rename.
create or replace function public.machine_change_value(p_field text, p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_field
    when 'status_id'   then (select s.name_en from public.status_values s where s.id = p_value::uuid)
    when 'customer_id' then (select c.name from public.customers c where c.id = p_value::uuid)
    when 'location_id' then (select l.name from public.locations l where l.id = p_value::uuid)
    else p_value
  end;
$$;

-- 6. After every insert or update of a machine, from any path (app, checkin trigger, import script)
create or replace function public.log_machine_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.machine_changes (company_id, machine_id, changed_by, action, field, old_value, new_value)
  select new.company_id,
         new.id,
         auth.uid(),
         case when tg_op = 'INSERT' then 'create' else 'update' end,
         n.key,
         public.machine_change_value(n.key, o.value),
         public.machine_change_value(n.key, n.value)
  from jsonb_each_text(to_jsonb(new)) n
  left join jsonb_each_text(case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end) o
    on o.key = n.key
  -- is_active follows the status, az_no_number follows az_no
  where n.key not in ('id', 'company_id', 'created_at', 'updated_at', 'az_no_number', 'is_active')
    and case when tg_op = 'INSERT' then n.value is not null else n.value is distinct from o.value end;

  return null;
end;
$$;

create trigger machines_log_changes
after insert or update on public.machines
for each row execute function public.log_machine_changes();

revoke execute on function public.machine_change_value(text, text) from public, anon, authenticated;
revoke execute on function public.log_machine_changes() from public, anon, authenticated;

-- 7. Row Level Security: everyone in the company reads the log; nobody writes it directly
alter table public.machine_changes enable row level security;

create policy "Users see machine changes in their company"
on public.machine_changes for select to authenticated
using (company_id = (select public.current_company_id()));

revoke all on public.machine_changes from anon, authenticated;
grant select on public.machine_changes to authenticated;

-- 8. Machine managers can add customers and locations while they edit a machine (no update, no delete)
create policy "Machine managers add customers in their company"
on public.customers for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('machines.manage')));

create policy "Machine managers add locations in their company"
on public.locations for insert to authenticated
with check (company_id = (select public.current_company_id()) and (select public.has_permission('machines.manage')));

-- 9. Save a machine from the register edit screen, in one transaction.
-- Security invoker: the caller's RLS policies and grants apply. Errors use the message as a code for the app.
create or replace function public.save_machine(p_machine jsonb, p_expected_updated_at timestamptz default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company    uuid := public.current_company_id();
  v_id         uuid := (p_machine->>'id')::uuid;
  v_saved      uuid;
  v_row        public.machines;
  v_name       text;
  v_active     boolean;
  v_constraint text;
begin
  -- Checked first: otherwise an update that RLS hides would look like "changed by someone else".
  if v_company is null or not public.has_permission('machines.manage') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_row := jsonb_populate_record(null::public.machines, p_machine);

  begin
    -- a. New customer: reuse a customer with the same name ignoring case, else create it.
    if jsonb_typeof(p_machine->'new_customer') = 'object' then
      v_name := btrim(regexp_replace(coalesce(p_machine->'new_customer'->>'name', ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
      if v_name = '' then
        raise exception 'customer_name_required';
      end if;
      if jsonb_typeof(p_machine->'new_customer'->'is_sister_company') is distinct from 'boolean' then
        raise exception 'sister_company_required';
      end if;

      insert into public.customers (company_id, name, is_sister_company)
      values (v_company, v_name, (p_machine->'new_customer'->>'is_sister_company')::boolean)
      on conflict (company_id, lower(name)) do nothing
      returning id into v_row.customer_id;

      if v_row.customer_id is null then
        select c.id into v_row.customer_id
        from public.customers c
        where c.company_id = v_company and lower(c.name) = lower(v_name);
      end if;
    end if;

    -- b. New location: the same, in title case like the import (each word: first letter upper, rest lower).
    if jsonb_typeof(p_machine->'new_location') = 'object' then
      v_name := btrim(regexp_replace(coalesce(p_machine->'new_location'->>'name', ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
      if v_name = '' then
        raise exception 'location_name_required';
      end if;
      select string_agg(upper(left(t.w, 1)) || lower(substr(t.w, 2)), ' ' order by t.i) into v_name
      from regexp_split_to_table(v_name, ' ') with ordinality as t(w, i);

      insert into public.locations (company_id, name)
      values (v_company, v_name)
      on conflict (company_id, lower(name)) do nothing
      returning id into v_row.location_id;

      if v_row.location_id is null then
        select l.id into v_row.location_id
        from public.locations l
        where l.company_id = v_company and lower(l.name) = lower(v_name);
      end if;
    end if;

    -- d. is_active follows the chosen status.
    select s.is_active into v_active
    from public.status_values s
    where s.id = v_row.status_id and s.company_id = v_company;
    if v_active is null then
      raise exception 'invalid_status';
    end if;

    -- c. Insert, or update only if nobody saved the machine since the form loaded it.
    if v_id is null then
      insert into public.machines (
        company_id, asset_no, az_no, chassis_no, serial_no, plate_no, istimara_serial_no,
        main_category, sub_category, sub_category_2, asset_type, description, manufacturer, model,
        capacity, capacity_unit, mfg_year, status_id, customer_id, location_id, site, project_name,
        insurance_expiry, mvpi_expiry, tuv_certificate_no, tuv_certificate_expiry,
        operational_card_no, operational_card_expiry, isthimara_expiry,
        fuel_type, fuel_chip, gps_installed, gps_imei, gps_date, mobilization_date, date_received,
        ownership_note, is_active
      ) values (
        v_company, v_row.asset_no, v_row.az_no, v_row.chassis_no, v_row.serial_no, v_row.plate_no, v_row.istimara_serial_no,
        v_row.main_category, v_row.sub_category, v_row.sub_category_2, v_row.asset_type, v_row.description, v_row.manufacturer, v_row.model,
        v_row.capacity, v_row.capacity_unit, v_row.mfg_year, v_row.status_id, v_row.customer_id, v_row.location_id, v_row.site, v_row.project_name,
        v_row.insurance_expiry, v_row.mvpi_expiry, v_row.tuv_certificate_no, v_row.tuv_certificate_expiry,
        v_row.operational_card_no, v_row.operational_card_expiry, v_row.isthimara_expiry,
        v_row.fuel_type, v_row.fuel_chip, v_row.gps_installed, v_row.gps_imei, v_row.gps_date, v_row.mobilization_date, v_row.date_received,
        v_row.ownership_note, v_active
      )
      returning id into v_saved;
    else
      update public.machines m set (
        asset_no, az_no, chassis_no, serial_no, plate_no, istimara_serial_no,
        main_category, sub_category, sub_category_2, asset_type, description, manufacturer, model,
        capacity, capacity_unit, mfg_year, status_id, customer_id, location_id, site, project_name,
        insurance_expiry, mvpi_expiry, tuv_certificate_no, tuv_certificate_expiry,
        operational_card_no, operational_card_expiry, isthimara_expiry,
        fuel_type, fuel_chip, gps_installed, gps_imei, gps_date, mobilization_date, date_received,
        ownership_note, is_active
      ) = (
        v_row.asset_no, v_row.az_no, v_row.chassis_no, v_row.serial_no, v_row.plate_no, v_row.istimara_serial_no,
        v_row.main_category, v_row.sub_category, v_row.sub_category_2, v_row.asset_type, v_row.description, v_row.manufacturer, v_row.model,
        v_row.capacity, v_row.capacity_unit, v_row.mfg_year, v_row.status_id, v_row.customer_id, v_row.location_id, v_row.site, v_row.project_name,
        v_row.insurance_expiry, v_row.mvpi_expiry, v_row.tuv_certificate_no, v_row.tuv_certificate_expiry,
        v_row.operational_card_no, v_row.operational_card_expiry, v_row.isthimara_expiry,
        v_row.fuel_type, v_row.fuel_chip, v_row.gps_installed, v_row.gps_imei, v_row.gps_date, v_row.mobilization_date, v_row.date_received,
        v_row.ownership_note, v_active
      )
      where m.id = v_id and m.updated_at = p_expected_updated_at
      returning m.id into v_saved;

      if v_saved is null then
        if exists (select 1 from public.machines m where m.id = v_id) then
          raise exception 'machine_changed';
        end if;
        raise exception 'machine_not_found';
      end if;
    end if;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception '%', case v_constraint
        when 'machines_company_id_asset_no_key'   then 'duplicate_asset_no'
        when 'machines_company_id_az_no_key'      then 'duplicate_az_no'
        when 'machines_company_id_chassis_no_key' then 'duplicate_chassis_no'
        when 'machines_company_id_serial_no_key'  then 'duplicate_serial_no'
        else 'duplicate_value'
      end;
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'invalid_value' using detail = v_constraint;
  end;

  return v_saved;
end;
$$;

revoke execute on function public.save_machine(jsonb, timestamptz) from public, anon;
grant execute on function public.save_machine(jsonb, timestamptz) to authenticated;
