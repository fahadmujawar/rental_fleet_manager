# Handoff: Rental Fleet Manager (as of 12 October 2026)

Read this first, together with CLAUDE.md and docs/spec.md (Draft 5).

## What this is
A multi company fleet operations web app for equipment rental companies. TCS (Technical Construction Services, Jubail) is the first customer. Full scope is in docs/spec.md. We are following the build order in spec section 11.

## Working style
- Fahad wants to understand every line. Explain plans before code.
- Claude Code prompts must be complete, decide everything, and handle real edge cases in one pass. Cosmetic cases are decided, not asked about.
- Design tables in chat first, then give Claude Code one prompt in plan mode, review its plan and file before pushing.
- Never edit a migration after it has been pushed. Fixes go in a new migration.

## Environment
- Windows, PowerShell, VS Code with the Claude Code extension (not the standalone CLI).
- Repo: D:\rental_fleet_manager, branch main, pushed to a private GitHub repo: github.com/fahadmujawar/rental_fleet_manager
- Node.js v24.21.0, npm 11.19.0, Git 2.49.
- Supabase CLI 2.120.0 installed through Scoop. Do not use npx supabase: version 2.120.0 of the npm wrapper looks for @supabase/cli-win32-x64, which does not exist (the real package is @supabase/cli-windows-x64).
- After installing any tool, fully close VS Code (check Task Manager) or its terminal will not see the new PATH.
- .gitattributes sets LF line endings for the whole repo.

## Repo layout
- CLAUDE.md: rules for Claude Code
- docs/spec.md: product spec (the Word copy, Draft 5, is kept outside the repo)
- supabase/: CLI config and migrations
- web/: React 19 + Vite 8 + TypeScript app
- web/.env.local: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (git ignored, never commit)

## Supabase
- Project fleet-dev, region Central EU (Frankfurt) eu-central-1, ref uineevqyirwqpdlrqyrx, free plan. Test project only; the live TCS project will be created separately.
- Created with: Data API on, "Automatically expose new tables" OFF (every table needs explicit GRANTs), automatic RLS ON.
- CLI is logged in and the folder is linked. Push with: supabase db push

## Migrations applied (in order)
1. 20261010190916_create_companies.sql: set_updated_at() trigger function; companies table (name, short_code ^[A-Z0-9]{2,10}$, default_language, timezone Asia/Riyadh, is_active); RLS; select granted to authenticated.
2. 20261010193303_create_access_foundation.sql: profiles (id = auth.users id), roles (per company), permissions (global list), role_permissions, user_roles; paired (id, company_id) foreign keys so nothing crosses companies; helpers current_company_id() and has_permission(p), both requiring an active profile and an active company; RLS policies; column level grants; no deletes on profiles or roles.
3. 20261010203251_create_machines.sql: status_values (code, name_en, name_ar, sort_order), customers, locations (names unique per company ignoring case), machines (register columns plus job card fields, chassis_no and serial_no both unique per company, plate_no not unique); permissions machines.manage and lists.manage; RLS and column level grants; no deletes.
4. 20261011185651_create_status_checkins.sql: customers.is_sister_company; permission checkins.submit; status_checkins (one per machine per day, date window today minus 7 to today in the company timezone, checked in a trigger, not a CHECK); trigger apply_status_checkin() blocks inactive machines and statuses, locks the machine row, records who made the last change; trigger sync_machine_status() copies the status to the machine only for the newest checkin and only when status_id changes; any user with checkins.submit in the company can correct a checkin.
5. 20261012120000_register_v2_status_and_columns.sql: status_values.requires_checkin (boolean, default true); the 15 TCS status values (idle_yard renamed to ready_in_yard, on_hire to on_hire_customer, broken_down_site to broken_down_on_site, so ids stayed; skipped if company TCS does not exist); 17 new nullable machines columns: az_no (unique per company when not null), ownership_note, project_name, istimara_serial_no, insurance_expiry, mvpi_expiry, tuv_certificate_no, tuv_certificate_expiry, operational_card_no, operational_card_expiry, mobilization_date, date_received, fuel_type, fuel_chip, gps_imei, gps_installed, gps_date. Plate No uses the existing plate_no column. Column update grants added; the existing RLS policies cover the new columns.

6. 20261012130000_machines_az_no_number.sql: machines.az_no_number, a stored generated bigint from az_no (only when az_no is 1 to 18 digits), used only to sort Az No in number order. No new grant or policy.
7. 20261012140000_machine_editing.sql: roles.name_ar; TCS role operations_manager ("Operations manager", "مدير العمليات") with machines.manage (company_admin keeps it); uniqueness checks (asset_no per company, customer and location names ignoring case; all existed, added only if missing); table machine_changes (one row per changed column, status/customer/location stored as names, changed_by null = no logged in user) written only by the security definer trigger log_machine_changes() after insert or update on machines (skips id, company_id, created_at, updated_at, az_no_number, is_active), select for the company, no write grant; insert policies on customers and locations for machines.manage; function save_machine(p_machine jsonb, p_expected_updated_at timestamptz), security invoker, execute for authenticated only: optional new customer / location (case insensitive reuse), is_active from the status, insert or update only when updated_at matches, error codes not_allowed, machine_changed, machine_not_found, duplicate_asset_no, duplicate_az_no, duplicate_chassis_no, duplicate_serial_no, customer_name_required, sister_company_required, location_name_required, invalid_status, invalid_value. Tested in SQL as Fahad (rolled back): create 10 log rows, update 2, stale save, duplicates, delete refused, direct log insert refused.

## Data in fleet-dev (test data, entered in the SQL Editor)
- Company TCS ("Technical Construction Services").
- Fahad's login (fahadmujawar002@gmail.com) with a profile in TCS.
- Role company_admin, holding all five permissions: users.manage, roles.manage, machines.manage, lists.manage, checkins.submit. Fahad has this role.
- Role operations_manager (machines.manage only), from migration 7. No user has it yet: add the Operations user with docs/admin/add_user.md (profiles and roles are added by hand; there is no trigger on auth.users).
- Fifteen TCS status values (list below) with English and Arabic names (Arabic not yet checked by a native speaker).
- Register imported again 12 October 2026 from Total_Assets.xlsx (last run after the case rule was added: 1 value changed, "Drilling Equipment" to "DRILLING EQUIPMENT" on 11-02-0001; now 13 main categories): 3,767 machines (1,971 in yard needs makeup, 623 scrapped, 381 under repair, 259 on hire sister company, 212 on hire customer, 112 sister company no access, 98 ready in yard, 71 with Azmeel not rentable, 21 accident damage, 19 in TCS use; 623 inactive), 0 rejected. 480 machines from the old register that are not in the file were deleted. 24 customers (13 sister companies), 24 locations; unused old customers and locations were deleted.
- RLS was tested: a logged in user sees only their company and profile; anon gets permission denied; deactivating the company locks the user out.

## App state (web/)
- Login page and protected home page showing the user's name and company through RLS.
- react-i18next with English and Arabic (src/locales), dir="rtl" for Arabic, Tailwind logical classes only, React Router, single Supabase client in src/lib/supabase.ts.
- All seven manual tests passed. Bundle size warning (about 556 kB) is known and ignored for now.
- Read only machine register (12 October 2026; manual tests pending):
  - /machines: server side paging (50 rows, exact count), search on TCS No, Az No, plate, chassis, serial and description (300 ms delay, PostgREST or() with escaped values), filters Status, Main Category, Company/Department, Location, Show inactive. All list state is in the URL query string. Table at 768 px and wider (scrolls sideways in its own box when needed), cards below. Picking an inactive status also turns on Show inactive.
  - List fields, chosen by Operations, in this order: Az No, TCS No, Sub Category 2, Type, Description, Company/Department, Ownership, Location, Site, Chassis No, Plate No, then Status (Fahad). Manufacturing Name was removed from the list on request; it shows on the detail page. Company/Department shows the company short code (TCS) when a machine has no customer.
  - Sort: Az No (number order through az_no_number; other values after the numbers), TCS No (default), Plate No, Company/Department, Status (status sort_order). Empty values come last in both directions; TCS No is always the last sort key.
  - /machines/:id: Identification, Specification, Assignment, Compliance (Expired / Expires soon labels, today in the company time zone), Other, Latest checkin. "Machine not found" for an unknown id, a malformed id or a row RLS hides.
  - Code: src/machines (types, queries, fields, validation), src/lib (format, search, text, uuid), src/components (AppHeader, ChangeHistory, CompanyDepartment, LtrValue, Pager, SisterBadge), src/pages (MachineListPage, MachineDetailPage, MachineFormPage), src/auth/usePermission.ts, src/router.tsx.
- Register editing (12 October 2026; manual tests pending):
  - Router: createBrowserRouter in src/router.tsx (a data router, needed for useBlocker); App.tsx was removed. RequireAuth sends the page to /login, and the login returns to it.
  - usePermission('machines.manage') calls has_permission once per user; Add machine (list) and Edit (detail) show only when true. RLS still decides.
  - /machines/new and /machines/:id/edit: the five detail sections, every field editable, same labels; validation rules copied from the import script (src/machines/validation.ts); category suggestions with case matching; Company/Department and Location selects with Add new; confirmation when an active status changes to an inactive one; Save calls save_machine; "changed by someone else" message with Reload; duplicate codes shown under the field; unsaved changes ask before leaving (in app and browser close). Without machines.manage: "You do not have permission to edit machines".
  - Fields not on the form are kept as they are: old_asset_no, engine_model, engine_no, colour, warranty_expiry (job card fields, step 3).
  - Detail page: Change history (newest first, 20 per page, company time zone, "Import" when changed_by is null).
  - Known limits: the Main Category list is read from machines in chunks of 1,000 rows (main_category is text, not a list table); a view can replace this later. A typed * in the search matches any one character (PostgREST treats * as a wildcard).

## Who can write machines (checked 12 October 2026 against migrations and fleet-dev)
- Insert: an authenticated user with an active profile in an active company who holds an active role with the active permission machines.manage, and only rows with their own company_id. Roles company_admin (Fahad) and operations_manager (no user yet). The app writes through save_machine (security invoker, so the same rules apply).
- Every insert and update, from any path, is logged in machine_changes by a trigger. Nobody can write machine_changes directly.
- Update: the same condition for the old and the new row, and only the granted columns (not id, company_id, created_at, updated_at). Indirect: the security definer trigger sync_machine_status() changes machines.status_id when a user with checkins.submit saves the newest checkin for a machine (today also only company_admin).
- Delete: nobody through the app (no delete grant, no delete policy). anon has no grants. Only the database owner connection (the import script) bypasses RLS.

## Arabic interface strings to review (machine register, written 12 October 2026)
Field labels: رقم TCS، رقم أزميل، الوصف، الفئة الرئيسية، الفئة الفرعية، الفئة الفرعية 2، النوع، الطراز، السعة، سنة الصنع، الحالة، الشركة/القسم (Company/Department)، اسم الشركة المصنعة (Manufacturing Name)، الملكية (Ownership)، الموقع (Site)، المنطقة (Location)، اسم المشروع، رقم الشاسيه، الرقم التسلسلي، رقم اللوحة، الرقم التسلسلي للاستمارة، انتهاء التأمين، انتهاء الفحص الدوري (MVPI)، رقم شهادة TUV، انتهاء شهادة TUV، رقم بطاقة التشغيل، انتهاء بطاقة التشغيل، انتهاء الاستمارة، نوع الوقود، شريحة الوقود، جهاز GPS مركّب، رقم IMEI لجهاز GPS، تاريخ GPS، تاريخ التحريك، تاريخ الاستلام.
Other: غير محدد، نعم، لا، إعادة المحاولة، رجوع، الرئيسية، شركة شقيقة، القائمة الرئيسية، سجل المعدات، بحث، (search hint) رقم TCS أو رقم أزميل أو اللوحة أو الشاسيه أو الرقم التسلسلي أو الوصف، الكل، إظهار غير النشطة، الترتيب، الترتيب حسب {{column}}، {{column}}، تصاعدي، {{column}}، تنازلي، {{from}} إلى {{to}} من {{total}}، السابق، التالي، لا توجد معدات مطابقة، تعذّر تحميل المعدات.، التعريف، المواصفات، التخصيص، الامتثال، أخرى، آخر تسجيل حالة، منتهي، ينتهي قريبًا، التاريخ، أرسله، لا توجد تسجيلات حالة بعد، المعدة غير موجودة، العودة إلى قائمة المعدات، تعذّر تحميل المعدة.

## Arabic interface strings to review (register editing, written 12 October 2026)
Role: مدير العمليات (Operations manager).
Buttons and titles: إضافة معدة، تعديل، تعديل المعدة، حفظ، جارٍ الحفظ…، إلغاء، إعادة التحميل، اختر…، إضافة جديد…، وحدة السعة.
Form: الحقول المميزة بـ * مطلوبة.، ليست لديك صلاحية تعديل المعدات، تعذّر تحميل النموذج.، {{code}} (بدون عميل)، {{name}} (شركة شقيقة)، اسم الشركة/القسم الجديد، اسم المنطقة الجديدة، {{name}} (غير نشطة)، هذه الحالة غير نشطة. ستخرج المعدة من القائمة النشطة ومن تسجيل الحالة اليومي. هل تريد المتابعة؟، لديك تغييرات غير محفوظة. هل تريد مغادرة هذه الصفحة وفقدانها؟، صحّح الحقول المميزة باللون الأحمر ثم احفظ مرة أخرى.، قام شخص آخر بتغيير هذه المعدة بعد أن فتحتها. لم تُحفظ تغييراتك. أعد التحميل لرؤية أحدث القيم ثم أدخل تغييراتك مرة أخرى.
Field errors: أدخل قيمة.، اختر نعم أو لا.، استخدم {{max}} حرفًا أو أقل.، استخدم الحروف والأرقام والشرطة فقط، على أن يبدأ بحرف أو رقم (30 حرفًا كحد أقصى).، استخدم الحروف والأرقام والرموز / . - فقط، على أن يبدأ بحرف أو رقم (40 حرفًا كحد أقصى).، أدخل سنة صحيحة من {{min}} إلى {{max}}.، أدخل رقمًا أكبر من 0.، أدخل تاريخًا صحيحًا.، يوجد رقم TCS هذا لمعدة أخرى.، يوجد رقم أزميل هذا لمعدة أخرى.، يوجد رقم الشاسيه هذا لمعدة أخرى.، يوجد الرقم التسلسلي هذا لمعدة أخرى.
Save errors: لم تعد هذه المعدة موجودة.، اختر حالة صحيحة.، إحدى القيم بصيغة غير صحيحة. تحقق من الحقول ثم احفظ مرة أخرى.، إحدى القيم مستخدمة لمعدة أخرى.، تعذّر حفظ المعدة. حاول مرة أخرى.
Change history: سجل التغييرات، لا توجد تغييرات بعد، تعذّر تحميل سجل التغييرات.، الاستيراد، إنشاء، القيمة السابقة، القيمة الجديدة.

## Answered by Fahad (11 October 2026)
1. "WORKSHOP REPAIRING" means the machine is in the workshop yard. Only some of those are actually under repair, and the August register does not say which.
2. TCS owns every machine. "Company / Department" shows which company uses the machine now. Users are either sister companies or outside customers.

## Register source (decided 12 October 2026)
- The register comes only from data/Total_Assets.xlsx (sheet "Sheet1", header row 1), supplied by Operations. Main_Data_17-8-25.xlsx and Main_Data_April_30_2025.xlsx are no longer used. The data folder is git ignored.
- From now on Operations edits the register in the app (register edit screen built 12 October 2026). After Operations start editing, do not import the Excel file again: the import overwrites app edits (they are logged as "Import"). A machine added in the app, or with any logged change, stops the import if it is not in the file.
- TCS owns every machine. OwnerShip (Azmeel, Ajel, Orix and others) is stored as ownership_note, information only.

## TCS status values (code, English, active, requires checkin)
| # | code | English | Arabic | active | checkin |
|---|---|---|---|---|---|
| 1 | ready_in_yard | Ready in yard | جاهز في الساحة | yes | yes |
| 2 | in_yard_makeup | In yard needs makeup | في الساحة بحاجة إلى تجهيز | yes | yes |
| 3 | under_repair | Under repair | قيد الإصلاح | yes | yes |
| 4 | awaiting_repair | Awaiting repair | بانتظار الإصلاح | yes | yes |
| 5 | accident_damage | Accident damage | متضرر بحادث | yes | yes |
| 6 | broken_down_on_site | Broken down on site | معطل في الموقع | yes | yes |
| 7 | on_hire_customer | On hire customer | مؤجر لعميل | yes | yes |
| 8 | on_hire_sister | On hire sister company | مؤجر لشركة شقيقة | yes | yes |
| 9 | sister_no_access | Sister company no access | لدى شركة شقيقة بدون وصول | yes | no |
| 10 | azmeel_private | With Azmeel not rentable | لدى أزميل غير متاح للتأجير | yes | no |
| 11 | in_tcs_use | In TCS use | قيد استخدام TCS | yes | yes |
| 12 | scrapped | Scrapped | خردة | no | no |
| 13 | sold | Sold | مباع | no | no |
| 14 | stolen | Stolen | مسروق | no | no |
| 15 | missing | Missing | مفقود | no | no |

The Arabic for rows 1, 2, 7, 8, 9, 10 and 11 was written on 12 October 2026 and needs a native speaker review. requires_checkin is stored but not yet used by any screen or trigger.

## Import script (done)
- scripts/import_register/import_register.py, with its own .venv and a .env holding DATABASE_URL (session pooler, eu-central-1; both git ignored). Dry run by default; --apply writes in one transaction; --apply stops if the expected counts do not match, unless --force. Rerunnable: a second run gave 0 inserts, 3,767 updates, 0 deletes.
- Run from scripts/import_register: .\.venv\Scripts\python.exe import_register.py [--apply] [--force]
- Rules: see scripts/import_register/README.md. Status comes from 13 ordered rules on TCS No, Rent-Description, Site and Status. TCS machines not in the file, and customers and locations no machine uses, are deleted. Customer is_sister_company is the majority of its machines' Rent-Description.
- Main Category, Sub Category, Sub Category 2 and Type: values that differ only in case become one value, the spelling most used in the file (first seen on a tie), the same method as customer names (report reason case_unified).
- Report: data/import_report.csv. Removed on the 12 October import: 259 capacities that were not single numbers, 14 unreadable chassis numbers, 1 unreadable serial number, 2 duplicate chassis numbers on 4 machines, 6 values in date columns that were not real dates. 375 chassis values moved to serial_no.
- Location alias (12 October 2026): "Jaffurah" is stored as "Jafurah" (LOCATION_ALIASES). Applied before migration 7; fleet-dev now has one location Jafurah (3 machines) and 23 locations in total.
- With the change log trigger, the script clears chassis_no, serial_no and az_no before the upsert only where the value changes. A run after migration 7 wrote 0 machine_changes rows.
- Claude Code also has a Supabase connector that can run SQL on fleet-dev; do not give it write access to the live project.

## Known data problems
- About 250 plate numbers repeat: review separately.
- Sites keep the value as typed, including client names and ACCIDENT. WORKSHOP REPAIRING and SCRAP IN YARD give no site text.

## Next steps, in order
1. Replace docs/spec.md with Draft 6 (Fahad).
2. Commit and push the migration, scripts/import_register and docs (not .env, .venv or data).
3. App: run the manual tests for the machine register and register editing; add the Operations user (docs/admin/add_user.md); then the daily checkin screen (finishes build step 2). Needs a Supervisor role with checkins.submit.
4. Have an Arabic speaker check the status names and the interface strings listed above.
5. Build step 3: fault reports and work orders (job cards).

## Open questions from the spec (section 10)
Storage approach confirmation, TCS stock count, number of TCS stores, latest register copy, sold and stolen import (decided: inactive), extra April sheets, TCS tax rate for job cards, location consent under Saudi PDPL.