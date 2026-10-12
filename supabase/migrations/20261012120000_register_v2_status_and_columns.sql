-- 1. Status values: does a machine in this status need a daily checkin?
alter table public.status_values
  add column if not exists requires_checkin boolean not null default true;

grant update (requires_checkin) on public.status_values to authenticated;

-- 2. TCS status list (register from Total_Assets.xlsx)
-- Rows whose meaning stays the same are renamed in place, so their ids do not change.
do $$
declare
  tcs_id     uuid;
  referenced text;
begin
  select id into tcs_id from public.companies where short_code = 'TCS';
  if tcs_id is null then
    raise notice 'Company TCS not found: status list not changed';
    return;
  end if;

  update public.status_values set code = 'ready_in_yard'
  where company_id = tcs_id and code = 'idle_yard';

  update public.status_values set code = 'on_hire_customer'
  where company_id = tcs_id and code = 'on_hire';

  update public.status_values set code = 'broken_down_on_site'
  where company_id = tcs_id and code = 'broken_down_site';

  insert into public.status_values (company_id, code, name_en, name_ar, sort_order, is_active, requires_checkin)
  select tcs_id, v.code, v.name_en, v.name_ar, v.sort_order, v.is_active, v.requires_checkin
  from (values
    ('ready_in_yard',       'Ready in yard',             'جاهز في الساحة',              1, true,  true),
    ('in_yard_makeup',      'In yard needs makeup',      'في الساحة بحاجة إلى تجهيز',   2, true,  true),
    ('under_repair',        'Under repair',              'قيد الإصلاح',                 3, true,  true),
    ('awaiting_repair',     'Awaiting repair',           'بانتظار الإصلاح',             4, true,  true),
    ('accident_damage',     'Accident damage',           'متضرر بحادث',                 5, true,  true),
    ('broken_down_on_site', 'Broken down on site',       'معطل في الموقع',              6, true,  true),
    ('on_hire_customer',    'On hire customer',          'مؤجر لعميل',                  7, true,  true),
    ('on_hire_sister',      'On hire sister company',    'مؤجر لشركة شقيقة',            8, true,  true),
    ('sister_no_access',    'Sister company no access',  'لدى شركة شقيقة بدون وصول',    9, true,  false),
    ('azmeel_private',      'With Azmeel not rentable',  'لدى أزميل غير متاح للتأجير', 10, true,  false),
    ('in_tcs_use',          'In TCS use',                'قيد استخدام TCS',            11, true,  true),
    ('scrapped',            'Scrapped',                  'خردة',                       12, false, false),
    ('sold',                'Sold',                      'مباع',                       13, false, false),
    ('stolen',              'Stolen',                    'مسروق',                      14, false, false),
    ('missing',             'Missing',                   'مفقود',                      15, false, false)
  ) as v(code, name_en, name_ar, sort_order, is_active, requires_checkin)
  on conflict (company_id, code) do update set
    name_en          = excluded.name_en,
    name_ar          = excluded.name_ar,
    sort_order       = excluded.sort_order,
    is_active        = excluded.is_active,
    requires_checkin = excluded.requires_checkin;

  -- Any other TCS status: stop if something uses it, else remove it.
  select string_agg(s.code, ', ') into referenced
  from public.status_values s
  where s.company_id = tcs_id
    and s.code not in (
      'ready_in_yard', 'in_yard_makeup', 'under_repair', 'awaiting_repair', 'accident_damage',
      'broken_down_on_site', 'on_hire_customer', 'on_hire_sister', 'sister_no_access',
      'azmeel_private', 'in_tcs_use', 'scrapped', 'sold', 'stolen', 'missing')
    and (exists (select 1 from public.machines m where m.status_id = s.id)
         or exists (select 1 from public.status_checkins c where c.status_id = s.id));

  if referenced is not null then
    raise exception 'TCS status values still in use, not removed: %', referenced;
  end if;

  delete from public.status_values s
  where s.company_id = tcs_id
    and s.code not in (
      'ready_in_yard', 'in_yard_makeup', 'under_repair', 'awaiting_repair', 'accident_damage',
      'broken_down_on_site', 'on_hire_customer', 'on_hire_sister', 'sister_no_access',
      'azmeel_private', 'in_tcs_use', 'scrapped', 'sold', 'stolen', 'missing');
end;
$$;

-- 3. Machines: register columns from Total_Assets.xlsx (plate_no already exists)
alter table public.machines
  add column if not exists az_no                   text    null check (az_no ~ '^\S(.*\S)?$' and az_no !~ '[[:cntrl:]]' and char_length(az_no) <= 50),
  add column if not exists ownership_note          text    null check (ownership_note ~ '^\S(.*\S)?$' and ownership_note !~ '[[:cntrl:]]' and char_length(ownership_note) <= 200),
  add column if not exists project_name            text    null check (project_name ~ '^\S(.*\S)?$' and project_name !~ '[[:cntrl:]]' and char_length(project_name) <= 200),
  add column if not exists istimara_serial_no      text    null check (istimara_serial_no ~ '^\S(.*\S)?$' and istimara_serial_no !~ '[[:cntrl:]]' and char_length(istimara_serial_no) <= 100),
  add column if not exists insurance_expiry        date    null,
  add column if not exists mvpi_expiry             date    null,
  add column if not exists tuv_certificate_no      text    null check (tuv_certificate_no ~ '^\S(.*\S)?$' and tuv_certificate_no !~ '[[:cntrl:]]' and char_length(tuv_certificate_no) <= 100),
  add column if not exists tuv_certificate_expiry  date    null,
  add column if not exists operational_card_no     text    null check (operational_card_no ~ '^\S(.*\S)?$' and operational_card_no !~ '[[:cntrl:]]' and char_length(operational_card_no) <= 100),
  add column if not exists operational_card_expiry date    null,
  add column if not exists mobilization_date       date    null,
  add column if not exists date_received           date    null,
  add column if not exists fuel_type               text    null check (fuel_type ~ '^\S(.*\S)?$' and fuel_type !~ '[[:cntrl:]]' and char_length(fuel_type) <= 100),
  add column if not exists fuel_chip               text    null check (fuel_chip ~ '^\S(.*\S)?$' and fuel_chip !~ '[[:cntrl:]]' and char_length(fuel_chip) <= 100),
  add column if not exists gps_imei                text    null check (gps_imei ~ '^\S(.*\S)?$' and gps_imei !~ '[[:cntrl:]]' and char_length(gps_imei) <= 100),
  add column if not exists gps_installed           boolean null,
  add column if not exists gps_date                date    null;

create unique index if not exists machines_company_id_az_no_key
on public.machines (company_id, az_no) where az_no is not null;

-- 4. Grants: the existing machines policies cover the new columns; the app may update them
grant update (
  az_no, ownership_note, project_name, istimara_serial_no, insurance_expiry, mvpi_expiry,
  tuv_certificate_no, tuv_certificate_expiry, operational_card_no, operational_card_expiry,
  mobilization_date, date_received, fuel_type, fuel_chip, gps_imei, gps_installed, gps_date
) on public.machines to authenticated;
