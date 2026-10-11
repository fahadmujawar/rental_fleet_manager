# Rental Fleet Manager

Multi company fleet operations web app for equipment rental companies. TCS is the first customer. The full product spec is in docs/spec.md, and the current state of the project is in docs/HANDOFF.md. Read the relevant sections before starting any task.

## Stack
- Frontend: React 19, Vite, TypeScript, Tailwind CSS, React Router, react-i18next, in the web folder. Built as a Progressive Web App.
- Backend: Supabase (Postgres, Auth, Row Level Security, Storage, Edge Functions). Migrations are in supabase/migrations.
- Tools: Supabase CLI installed through Scoop, run as supabase. Do not use npx supabase.
- OS: Windows, PowerShell terminal.

## About the developer
- Fahad is new to SQL, React and web development, and wants to understand every line.
- Before changing any file, explain the plan in plain language and wait for approval.
- After a change, explain what each new or changed line does.
- Prefer small changes that can be reviewed in one sitting over large ones.
- If a request is unclear, ask instead of guessing.

## Rules
- Write your explanations and responses to me in ASD-STE100 Simplified Technical English. This does not apply to interface text in the app, which follows the translation files.
- Treat this as a production system. Before calling a task done: check it against docs/spec.md, handle the edge cases that cause real problems, and say how to test it.
- Every table except companies and permissions (a global list defined by the app) has a company_id column, and every table has Row Level Security enabled.
- New tables are not exposed to the app automatically. Every table the app needs must include explicit GRANT statements in its migration. Tables holding secrets, such as integration_connections, are never granted to app roles.
- Database changes go in SQL migration files, never made by hand in the dashboard without a matching migration. Never edit a migration that has already been pushed; write a new one.
- Never hardcode interface text. All text comes from translation files, and layouts must work right to left (Arabic, Urdu).
- Values that are in use (roles, severity levels, statuses, stages) are deactivated, never deleted.
- Never put secrets or keys in code or commit them. They go in a .env file listed in .gitignore.
- Follow the build order in docs/spec.md section 11. Do not start a later step early.
- For validation rules, handle the edge cases that cause real problems (blanks, duplicates, case, control characters, length) in one change. Leave cosmetic cases to the app, state that choice in one sentence, and only ask me about decisions with real consequences.

## Where to fix things
Where a bug shows up is often not where it should be fixed. Before writing code:
- Trace the data and control flow upstream far enough to understand why the current behaviour exists.
- Fix it at the earliest layer where the behaviour can be expressed naturally.
- If the change exposes a bad abstraction, duplicated responsibility or missing invariant, fix that instead of patching around it.

Optimise for the simplest resulting design, not the smallest diff. Existing code isn't correct just because it exists.

Red flags that you're patching downstream instead of fixing the model:
- boolean flags threaded through multiple layers
- duplicated conditions or special cases near the UI or final consumer
- state that only exists to compensate for another subsystem
- much more code than the behaviour seems to justify

Keep scope proportional. If the right fix needs a big refactor beyond the task, propose it before doing it.

After implementing, review the diff and ask: "Knowing the desired behaviour from the beginning, would I have designed it this way?" If not, simplify before calling it done.