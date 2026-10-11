# Handoff: Rental Fleet Manager (as of 11 October 2026, evening)

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

## Data in fleet-dev (test data, entered in the SQL Editor)
- Company TCS ("Technical Construction Services").
- Fahad's login (fahadmujawar002@gmail.com) with a profile in TCS.
- Role company_admin, holding all five permissions: users.manage, roles.manage, machines.manage, lists.manage, checkins.submit. Fahad has this role.
- Ten TCS status values with English and Arabic names (Arabic not yet checked by a native speaker).
- Register imported 11 October 2026: 4,247 machines (787 on hire, 2,739 idle in yard, 285 under repair, 26 accident damage, 229 scrapped, 91 sold, 85 stolen, 5 missing; 410 inactive), 25 customers (13 sister companies), 22 locations. Names fixed by hand: GTI Company, MAS, Dammam-Khobar.
- RLS was tested: a logged in user sees only their company and profile; anon gets permission denied; deactivating the company locks the user out.

## App state (web/)
- Login page and protected home page showing the user's name and company through RLS.
- react-i18next with English and Arabic (src/locales), dir="rtl" for Arabic, Tailwind logical classes only, React Router, single Supabase client in src/lib/supabase.ts.
- All seven manual tests passed. Bundle size warning (about 530 kB) is known and ignored for now.

## Answered by Fahad (11 October 2026)
1. "WORKSHOP REPAIRING" means the machine is in the workshop yard. Only some of those are actually under repair, and the August register does not say which.
2. TCS owns every machine. "Company / Department" shows which company uses the machine now. Users are either sister companies or outside customers.

## Import script (done)
- scripts/import_register/import_register.py, with its own .venv and a .env holding DATABASE_URL (session pooler, eu-central-1; both git ignored). Dry run by default; --apply writes in one transaction. Rerunnable: a second run gave 0 inserts and 4,247 updates. Machines that have checkins keep their status and active flag on rerun.
- Run from scripts/import_register: .\.venv\Scripts\python.exe import_register.py [--apply]
- Report: data/import_report.csv, plus a permanent copy data/import_report_2026-10-11.csv. Removed on import: 261 capacities that were not single numbers (for example 2-/24/26, 6x4), 14 unreadable chassis numbers, 3 duplicate chassis numbers on 6 machines (WT0014, 135653V, MB460085E).
- Customers to confirm with the team (imported as outside customers): Amaco, Arkad Camp (probably Arkad), Bin Quraya, Denys Arabia, Engineering Box Co, Samama Company.
- Claude Code's sandbox blocks Python network access; run the script in your own terminal. Claude Code also has a Supabase connector that can run SQL on fleet-dev; do not give it write access to the live project.

## Decided for the import
- Source: Main_Data_17-8-25.xlsx (sheet "MAIN DATA ", 4,247 assets, the layout the job card reads). Not in the repo. Ask the workshop for a newer copy before the real import.
- Sold, stolen and missing machines are imported as inactive history.
- Starting statuses come from the April 2025 file's Rent-Description, matched by asset number: "Major Breakdown" becomes Under repair, "Yard" becomes Idle in yard. Machines not in the April file become Idle in yard. The first daily checkins correct anything that changed.
- Every Company / Department name except TCS becomes a customer. Sister companies (from the April file): AZMEEL, ARKAD, ARFAD, Drilling Works, MAS, Electrical Solutions, Hexagon, Within, GTI Company, Evision Company, Hayakel, Saudi Widcon, Al Arabi. Outside customers: Saraya Alandalus, Ahak Company, Jadwal, Alshawaf, AIC Steel, Harby, Copasa, Al Hammash, Rely, Unified Solution, Shine, Synopc, Kalpataru. The customers table needs an is_sister_company flag (new migration).
- Status values for TCS: Working on hire, Idle in yard, Under repair, Awaiting repair, Broken down on site, Scrapped, plus Sold, Stolen, Missing and Accident damage. Must exist before machines are imported, because status_id is required.

## Known data problems the import must handle
- asset_no 11.02.0001 uses dots: convert to 11-02-0001.
- Chassis column holds serial numbers for equipment, written "S/NO. ..." or "S.NO. ...": move to serial_no with the prefix removed. Placeholders N/A (5) and bare S/NO. (3) become empty.
- Duplicate chassis numbers WT0014 and 135653V: check with the team.
- About 250 plate numbers repeat: review separately.
- Mixed case and trailing spaces in Company / Department and Location (Tcs, tCS, "Bin Quraya ", RIYADH and Riyadh): normalise.
- Site mixes conditions (WORKSHOP REPAIRING, SCRAP IN YARD, SOLD, STOLEN, ACCIDENT, Missing, STANDBY) with real sites and client names: conditions become statuses, the rest become site text or customers.
- 186 assets have no location, 212 no year, and some years are "#N/A": import as empty.
- Earlier light vehicles, attachments and Others sheets exist only in the April 2025 file; import decision still open.

## Next steps, in order
1. Commit and push scripts/import_register (not .env, .venv or data).
2. App: machine list and daily checkin screen (finishes build step 2). Needs a Supervisor role with checkins.submit.
3. Have an Arabic speaker check the status names; confirm the six customers above.
4. Build step 3: fault reports and work orders (job cards).

## Open questions from the spec (section 10)
Storage approach confirmation, TCS stock count, number of TCS stores, latest register copy, sold and stolen import (decided: inactive), extra April sheets, TCS tax rate for job cards, location consent under Saudi PDPL.