# MEKI Claude Code instructions

Read `client-resources/project-context.md` before planning or editing. The client PDFs and brand kit are primary sources, but the old Shark Clicks technical and responsibility assignments are superseded by the new team's choices in the project context. Track requirements and distinguish confirmed information from proposed/mock content.

## Fixed technical choices
- Public site + donor portal: Next.js + TypeScript + Tailwind CSS v4.
- Admin dashboard: separate Next.js app + Tailwind CSS v4.
- Backend API: NestJS (Node.js / TypeScript), modular monolith.
- Database: **MySQL + Prisma**, NOT PostgreSQL.
- Workspace: pnpm + Turborepo. Prefer OpenAPI-based typed API client.
- Urgent priority: landing page AND editable admin dashboard; complete portal/compliance features follow the approved scope.

## Guardrails
- No invented **verified** donation campaigns, donation totals, progress, testimonials, statistics, legal approvals, phone numbers or addresses. Where mock values are necessary, mark them `DEMO` and do not publish them as factual data.
- Separate `verified source data` (sector descriptions and media folders) from `proposed campaigns` (editable drafts), and `real transactions` (never seeded).
- Never activate real payment buttons until approved campaigns, payment vendor, merchant account, compliance requirements, and end-to-end tests are complete.
- Payment status must come from verified server-side provider notifications, not the frontend redirect; protect against duplicate webhooks.
- Never reset/drop/refresh any existing database or erase records. Always review migrations and backups before touching a database.
- Preserve official logos/brand files, don't overwrite original assets, don't commit proprietary client-resources or credentials.
- Don't ingest all source images into context. Inventory filenames, then inspect/select carefully.
- Build Arabic RTL and English LTR accessibility and responsive layouts.
- Use tests and run them without destroying the DB. Record commands and test results accurately.
- In planning phase, DO NOT install packages, create migrations or implement code. First create planning docs and seek sign-off.
