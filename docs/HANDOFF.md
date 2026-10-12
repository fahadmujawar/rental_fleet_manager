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

## Data in fleet-dev (test data, entered in the SQL Editor)
- Company TCS ("Technical Construction Services").
- Fahad's login (fahadmujawar002@gmail.com) with a profile in TCS.
- Role company_admin, holding all five permissions: users.manage, roles.manage, machines.manage, lists.manage, checkins.submit. Fahad has this role.
- Fifteen TCS status values (list below) with English and Arabic names (Arabic not yet checked by a native speaker).
- Register imported again 12 October 2026 from Total_Assets.xlsx: 3,767 machines (1,971 in yard needs makeup, 623 scrapped, 381 under repair, 259 on hire sister company, 212 on hire customer, 112 sister company no access, 98 ready in yard, 71 with Azmeel not rentable, 21 accident damage, 19 in TCS use; 623 inactive), 0 rejected. 480 machines from the old register that are not in the file were deleted. 24 customers (13 sister companies), 24 locations; unused old customers and locations were deleted.
- RLS was tested: a logged in user sees only their company and profile; anon gets permission denied; deactivating the company locks the user out.

## App state (web/)
- Login page and protected home page showing the user's name and company through RLS.
- react-i18next with English and Arabic (src/locales), dir="rtl" for Arabic, Tailwind logical classes only, React Router, single Supabase client in src/lib/supabase.ts.
- All seven manual tests passed. Bundle size warning (about 530 kB) is known and ignored for now.

## Answered by Fahad (11 October 2026)
1. "WORKSHOP REPAIRING" means the machine is in the workshop yard. Only some of those are actually under repair, and the August register does not say which.
2. TCS owns every machine. "Company / Department" shows which company uses the machine now. Users are either sister companies or outside customers.

## Register source (decided 12 October 2026)
- The register comes only from data/Total_Assets.xlsx (sheet "Sheet1", header row 1), supplied by Operations. Main_Data_17-8-25.xlsx and Main_Data_April_30_2025.xlsx are no longer used. The data folder is git ignored.
- From now on Operations edits the register in the app. That screen is not built yet. Until then, a new copy of the file can be imported with the script.
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
- Report: data/import_report.csv. Removed on the 12 October import: 259 capacities that were not single numbers, 14 unreadable chassis numbers, 1 unreadable serial number, 2 duplicate chassis numbers on 4 machines, 6 values in date columns that were not real dates. 375 chassis values moved to serial_no.
- Locations to check with Operations: Jaffurah and Jafurah are both in the file (probably one place).
- Claude Code also has a Supabase connector that can run SQL on fleet-dev; do not give it write access to the live project.

## Known data problems
- About 250 plate numbers repeat: review separately.
- Sites keep the value as typed, including client names and ACCIDENT. WORKSHOP REPAIRING and SCRAP IN YARD give no site text.

## Next steps, in order
1. Replace docs/spec.md with Draft 6 (Fahad).
2. Commit and push the migration, scripts/import_register and docs (not .env, .venv or data).
3. App: machine list, register edit screen for Operations, and daily checkin screen (finishes build step 2). Needs a Supervisor role with checkins.submit.
4. Have an Arabic speaker check the status names.
5. Build step 3: fault reports and work orders (job cards).

## Open questions from the spec (section 10)
Storage approach confirmation, TCS stock count, number of TCS stores, latest register copy, sold and stolen import (decided: inactive), extra April sheets, TCS tax rate for job cards, location consent under Saudi PDPL.