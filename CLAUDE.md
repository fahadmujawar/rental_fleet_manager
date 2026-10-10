# Rental Fleet Manager

Multi company fleet operations web app for equipment rental companies. TCS is the first customer. The full product spec is in docs/spec.md. Read the relevant section before starting any task.

## Stack
- Frontend: React with Vite, built as a Progressive Web App
- Backend: Supabase (Postgres, Auth, Row Level Security, Storage, Edge Functions)
- OS: Windows, PowerShell terminal

## About the developer
- Fahad is new to SQL, React and web development, and wants to understand every line.
- Before changing any file, explain the plan in plain language and wait for approval.
- After a change, explain what each new or changed line does.
- Prefer small changes that can be reviewed in one sitting over large ones.
- If a request is unclear, ask instead of guessing.

## Rules
- Every table except companies has a company_id column, and every table has Row Level Security enabled.
- New tables are not exposed to the app automatically. Every table the app needs must include explicit GRANT statements in its migration. Tables holding secrets, such as integration_connections, are never granted to app roles.
- Database changes go in SQL migration files, never made by hand in the dashboard without a matching migration.
- Never hardcode interface text. All text comes from translation files, and layouts must work right to left (Arabic, Urdu).
- Values that are in use (roles, severity levels, statuses, stages) are deactivated, never deleted.
- Never put secrets or keys in code or commit them. They go in a .env file listed in .gitignore.
- Follow the build order in docs/spec.md section 11. Do not start a later step early.
