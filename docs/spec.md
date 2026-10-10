# Fleet Operations Tool: Product Spec

*Draft 4, 10 October 2026. Status: for review by Fahad. Anything marked OPEN is not yet decided.*

## 1. Purpose

A web app that gives equipment rental companies one shared place to see the status of every machine, report faults, and move parts requests through their approval chain. Today at TCS this runs on WhatsApp messages, verbal approvals and paper, so nobody can easily see where a request is stuck or why a machine is down.

The product is built for many companies. TCS is the first customer and the pilot site.

## 2. Goals for the pilot

1.  **Visibility.** Anyone with permission can see the current status of every machine and every open parts request, and who is holding it.

2.  **Easier than WhatsApp.** A technician can report a fault with a photo in under a minute, from a phone, even with weak signal. If the app is slower than WhatsApp, technicians will not use it.

3.  **Audit trail.** Every decision on a parts request is recorded with who made it and when, including verbal approvals.

4.  **Foundations for growth.** The data structure supports multiple companies, and company admins can configure roles, severity levels, status values and approval stages themselves through editor screens.

## 3. Users and roles

Roles and their permissions are configurable per company. The table below shows the default roles loaded for TCS.

| Role           | Main actions in the pilot                                                                                                                                                                   |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Site supervisor    | Submits daily status checkins for machines on site (TCS default)                                                                                                                                |
| Site technician    | Reports faults with photos, requests parts                                                                                                                                                      |
| Workshop           | Reviews fault reports, assigns mechanics to work orders, raises material requests to Purchase                                                                                                   |
| Mechanic           | Carries out repairs on assigned work orders and updates their progress                                                                                                                          |
| Purchase manager   | Checks stock with Stores, can put requests on standby or restart them, researches suppliers, raises POs, receives and inspects parts, handles urgent deliveries                                 |
| Stores             | Confirms stock availability, receives parts from Purchase, issues parts to Workshop                                                                                                             |
| Operations manager | Can put requests on standby or restart them. Wider Operations duties (mobilisation, registration, MVPI, insurance, inspections, asset movement, violations, accidents) belong to a later module |
| General Manager    | Approves purchases of parts not in stock and cash purchases, sees every store issue and can hold it, can override any decision                                                                  |
| Finance            | Releases funds for approved cash purchases                                                                                                                                                      |
| Company admin      | Manages users, roles and permissions, severity levels, status values, workflow stages, the parts catalogue and urgent flags for their company                                                   |

Who submits the daily status checkin is a permission the company admin assigns, not a fixed role.

## 4. Pilot features

### 4.1 Accounts and companies
- Each user belongs to one company and sees only that company’s data, enforced in the database by Supabase Row Level Security.
- Roles and permissions stored in tables. TCS defaults loaded at setup, then managed through the admin editors (4.9).

### 4.2 Machine register
- Seeded from the cleaned TCS asset register using the existing import script.
- Searchable list and a detail page per machine showing latest status, open faults and open parts requests.

### 4.3 Daily status checkin
- A quick status per machine. TCS values: Working on hire, Idle in yard, Under repair, Broken down on site. Status values are configurable per company.
- Who may submit checkins is a permission assigned by the company admin. TCS default: Supervisor.

### 4.4 Fault reports
- Captures text, photos, voice notes, the phone’s location and a severity level.
- Severity levels are configurable per company. TCS levels: Stopped (machine cannot work), Working with a problem, Minor (fix when convenient).
- Levels can be renamed, reordered or added later. A level that is no longer wanted is deactivated, not deleted, so older fault reports keep their meaning.
- Photos and voice notes are stored in Supabase Storage, protected by the same access rules as the rest of the data. The database records which file store holds each file and its path, so files can move to cheaper storage later without a redesign (proposed, to be confirmed).
- Photos are compressed on the phone before upload. Voice notes have a maximum length.
- Location is the reporting phone’s location, captured only with the user’s permission.

### 4.5 Work orders
- A fault that needs repair becomes a work order. Workshop assigns one or more mechanics.
- Workshop updates progress on behalf of mechanics until the work order is closed. Mechanics can be given permission to update their own work orders later. A work order can raise a parts request.
- Parts requests can also come from periodic maintenance, though this is rare.

### 4.6 Parts requests
- A request moves through stages. Each stage names the responsible department and the allowed actions. Stages are stored in a table per company, so other companies can have different chains.
- Parts are picked from a parts catalogue, with a “not in list” free text option. An admin later matches free text entries to catalogue items.
- POs and finance papers stay in their current form. A photo or file can be attached at the relevant stage.
- The stock check at stage 3 reads live stock levels from the inventory (4.10).

### 4.7 Offline queue
- Checkins, fault reports and parts requests are saved on the phone when there is no signal and sent automatically when it returns. The screen clearly shows anything waiting to send.
- Viewing data needs a connection in the pilot.

### 4.8 Languages
- All interface text comes from translation files, one per language. Launch languages: English and Arabic.
- Layout supports right to left scripts (Arabic, Urdu) from the start. Hindi, Tamil, Telugu, Urdu and others are added later as new translation files.
- Text that users type, and voice notes, are not translated.

### 4.9 Admin editors
- Company admins can edit roles and permissions, severity levels, daily status values, the parts catalogue and urgent flags.
- Values in use are deactivated rather than deleted, so history keeps its meaning.
- Workflow stage editor: admins can add, remove and reorder stages and set the responsible role and allowed actions for each. Chains are versioned: requests in progress finish on the version they started with, and new requests use the latest version.
- Every change made in an editor is recorded with who made it and when.

### 4.10 Parts stock and inventory
- A company can have one or more stores. Stock is held per part per store.
- Every movement is recorded: received from Purchase, issued to Workshop, transferred between stores, and adjusted after a count. Stock levels are calculated from these movements, so every number can be traced.
- Stock counts: Stores can record a physical count, and the app records the difference as an adjustment with a reason.
- Optional minimum level per part, with an in app alert when stock falls below it.
- Prerequisite: a full physical stock count at the TCS store before inventory goes live. That count becomes the starting stock.

## 5. TCS parts request workflow

### 5.1 Normal path

| Stage | Responsible | What happens |
|-----------------------------------|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1\. Need reported                 | Site technician      | Reports that a part is needed, with a photo (today this is a WhatsApp message)                                                                                             |
| 2\. Material request              | Workshop             | Raises a material request to Purchase                                                                                                                                      |
| 3\. Stock check                   | Purchase with Stores | The app shows live stock for the part                                                                                                                                      |
| 4a. In stock                      | Purchase and Stores  | The part is issued directly to Workshop without GM approval. The GM is notified immediately inside the app and can put the issue on hold, but it goes ahead unless he acts |
| 4b. Not in stock                  | Purchase to GM       | Purchase requests approval to buy. GM and Purchase decide which part to buy                                                                                                |
| 5\. PO raised                     | Purchase             | Raises a PO to the chosen supplier                                                                                                                                         |
| 6\. Cash approval (only if cash)  | Purchase to GM       | If the supplier offers no credit terms, Purchase asks the GM to approve a cash purchase                                                                                    |
| 7\. Funds released (only if cash) | Finance              | Releases funds after GM approval                                                                                                                                           |
| 8\. Received and inspected        | Purchase             | Part arrives at Purchase and is checked                                                                                                                                    |
| 9\. Into store                    | Stores               | Part goes to Stores and stock is increased automatically                                                                                                                   |
| 10\. Issued                       | Workshop to Stores   | Workshop requests the part, Stores approves the issue, and stock is reduced automatically                                                                                  |

### 5.2 Cash or credit

Whether a purchase is cash based depends on the supplier’s payment terms. Purchase researches this and, when cash is needed, sends the request to the GM for approval. In the app, Purchase marks the PO as credit or cash, and only cash POs go through stages 6 and 7.

### 5.3 Standby and rejection

Requests are not rejected along the chain. Any one of the GM, the Purchase manager or the Operations manager can put a request on standby, and any of them can restart it. A reason is required for both and is recorded. Cancelling a request outright is allowed for the GM only by default; the permission can be granted to the Purchase or Operations manager.

### 5.4 GM override

The GM can reverse any stage. In rare cases he can also skip a stage or approve on someone else’s behalf. Every override requires a reason and is recorded in the audit trail, so overrides can be reviewed later.

### 5.5 Urgent path

Urgency depends on the part, not the person. Each catalogue part has an urgent flag, which can be switched on for any part when needed. At TCS only tyres are flagged for now. Everything else follows the normal path. For urgent parts, Purchase gets the part delivered straight to site first, and the normal stages are recorded afterwards. Approval before delivery is sometimes verbal for small issues and sometimes formal. The app lets Purchase mark a request as urgent and record a verbal approval with the approver’s name, date and time, so the audit trail stays complete.

## 6. Data model outline

Every table carries company_id. Field level detail comes in the schema design step.

| Table | Holds |
|--------------------------------------------------|------------------------------------------------------------------------------------------|
| companies                                        | Each customer company                                                                    |
| profiles                                         | Users, linked to Supabase login and a company                                            |
| roles, permissions, role_permissions, user_roles | Configurable access control                                                              |
| machines                                         | The fleet register                                                                       |
| status_checkins                                  | Daily status per machine                                                                 |
| severity_levels                                  | Configurable severity scale per company                                                  |
| fault_reports, fault_attachments                 | Faults, plus the file store and path of each photo and voice note                        |
| parts_catalogue                                  | Known parts, grown from real requests, each with an urgent flag                          |
| work_orders, work_order_assignments              | Repairs and the mechanics assigned to them                                               |
| status_values                                    | Configurable daily status options per company                                            |
| notifications                                    | Alerts such as the GM being told about a store issue                                     |
| workflow_versions, workflow_stages               | Versioned stage chains per company                                                       |
| stores                                           | Each store a company runs                                                                |
| stock_movements                                  | Every receipt, issue, transfer and adjustment                                            |
| stock_levels                                     | Current quantity per part per store, derived from movements                              |
| stock_counts                                     | Physical counts and the adjustments they produce                                         |
| config_changes                                   | Who changed what in the admin editors, and when                                          |
| parts_requests, parts_request_items              | Requests, their current stage and the parts asked for                                    |
| request_events                                   | Every stage move, standby, restart, override and verbal approval, with who, when and why |

## 7. Technology
- Frontend: React with Vite, built as a Progressive Web App so submissions can be queued offline. Decided 9 October 2026.
- Backend: Supabase (Postgres database, login, Row Level Security, file storage, Edge Functions for any server side code).
- Development: Git and GitHub, VS Code, Claude Code.

## 8. Out of scope for the pilot
- Voice note transcription and translation of user entered text.
- Full offline browsing and editing.
- Asset compliance module for Operations: registration, MVPI, insurance, third party inspections, documents and expiry dates, asset movement, condition checks, violations and accidents.
- Periodic maintenance scheduling every 260 hours per machine, which needs hour meter readings, plus maintenance after demobilisation.
- Client facing portal, possibly a separate Next.js site on the same database.
- Replacing PO documents or finance systems.

## 9. Risks

1.  **Timeline.** Admin editors and inventory roughly double the pilot scope. Building in the order in section 11 means the core can be tested before everything is finished.

2.  **Inventory accuracy.** If movements are not recorded every time, stock numbers drift from reality and users stop trusting the app. Needs a starting count and daily discipline at the store.

3.  **Technicians keep using WhatsApp.** This is the biggest risk, because technicians currently report by WhatsApp with a photo. If the fault report screen is not as fast, the pilot fails quietly. Possible fallback: Workshop enters reports on a technician’s behalf during the pilot.

4.  **People approve off the app.** If verbal approvals are not recorded, the audit trail becomes incomplete. The urgent path must make recording a verbal approval very quick.

5.  **Storage costs.** Photos and voice notes may exceed free tier storage. Supabase’s current limits are unverified and must be checked. Real usage from the first weeks of the pilot will show whether moving files is needed.

6.  **Location data and privacy.** Saudi Arabia’s Personal Data Protection Law may set consent requirements for location capture. Not verified; needs checking.

7.  **Security mistakes.** Row Level Security policies decide who sees what. Every policy must be reviewed line by line, not accepted unread.

## 10. Open questions and notes

1.  Storage approach in 4.4 is proposed and awaits confirmation.

2.  TCS stock count: who does it, and when?

3.  How many stores does TCS have?

4.  Location capture: check consent requirements under Saudi Arabia’s Personal Data Protection Law before the pilot.

## 11. Build order (proposed)

Each step is finished and tested before the next starts. Translations and right to left layout are built in from step 1.

1.  **Foundation.** Companies, users, login, roles and permissions, with Row Level Security.

2.  **Machines.** Machine register, imported from the cleaned asset register, and daily status checkins.

3.  **Faults.** Fault reports with photos, voice notes, location and severity, then work orders.

4.  **Parts and stock.** Parts catalogue, stores, stock movements and counts.

5.  **Parts requests.** Versioned workflow, standby, override, urgent path, GM notifications.

6.  **Admin editors.** Screens for every configurable list, including the workflow stage editor.

7.  **Offline queue.** Queued submissions for checkins, fault reports and parts requests.
