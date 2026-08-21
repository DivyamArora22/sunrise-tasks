# Sunrise Tasks

Sunrise Tasks is an intentionally narrow internal work-communication system for a small manufacturing business. An owner assigns work; an employee acknowledges it, reports progress, and completes it; both retain a permanent timeline. It is **not** a general project-management suite.

## What is included

- Responsive Next.js owner dashboard and employee-friendly task actions
- Expo app for both Android and iOS with Tasks, Notifications, and Profile tabs
- Shared TypeScript models, Zod validation, date handling, permissions helpers, and workflow rules
- Supabase Auth, PostgreSQL schema, RPC workflow functions, RLS, private attachment storage, in-app notifications, and Expo push-token architecture
- Local demo data (the web demo persists actions in browser storage) and automated business-logic tests

## Repository layout

```text
apps/web       Next.js responsive web application
apps/mobile    Expo / React Native Android and iOS application
packages/shared Shared domain types, validation, and task logic
supabase       Database migration, seed guidance, and push Edge Function
```

## Local development

### Prerequisites

Install Node.js 20+, npm 10+, Docker, [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), and (for native builds) the Expo/EAS CLI.

```bash
npm install
cp .env.example .env.local
supabase start
supabase db reset
```

Copy the local API URL and anon key printed by `supabase status` into `.env.local`. For the mobile app, copy the example into `apps/mobile/.env` and use the `EXPO_PUBLIC_*` names. Never expose the service-role key in a browser or mobile environment.

Run the web experience:

```bash
npm run dev:web
```

Open `http://localhost:3000`. With no configured backend, the checked-in demonstration UI remains usable and saves changes to local storage. Production integration should call the migration's `create_task`, `transition_task`, and `add_task_update` RPCs; direct employee task updates are deliberately denied by RLS.

Run the native app:

```bash
npm run dev:mobile
# press a for Android, i for iOS, or scan using a development build
```

### Create the first administrator

Public signup is disabled. In Supabase Dashboard, open **Authentication → Users → Add user** and create the owner without sharing a temporary password in source control. The auth trigger creates an employee profile. Promote the first trusted owner using the SQL editor while authenticated as the project operator:

```sql
update public.profiles set role = 'admin', department = 'Owner'
where email = 'owner@your-company.com';
```

Thereafter, create or invite controlled users from a server-only admin endpoint using the service-role client. Never ship that client or key to either app. Suggested demo identities are Owner, Rajesh Sharma (Plant Head), and Amit Gupta (Accounts); `supabase/seed.sql` intentionally stores no passwords.

## Database and security

Apply migrations with `supabase db push` for a linked project or `supabase db reset` locally. The migration stores UTC timestamps, indexes the assignment/due-date paths, and calculates overdue in clients rather than mutating status. RLS permits an active admin to see all work, while employees can only see tasks assigned to them. Security-definer RPCs validate each employee state transition atomically and write history plus owner notifications.

Attachments use the private `task-attachments` bucket, limited to JPEG, PNG, WebP, and PDF files up to 10 MB. Store objects under `<task-uuid>/<random-file-name>` so storage policies can verify task access.

## Push and in-app notifications

The mobile app requests permission on a physical device, creates the Android `tasks` channel, gets an Expo push token, and stores it in `push_tokens`. In-app events live in `notifications`; clients can query unread rows and set `read=true`.

To finish push delivery:

1. Run `eas init` and place its project ID in `EXPO_PUBLIC_EAS_PROJECT_ID` and `app.json` configuration.
2. Deploy: `supabase functions deploy send-push --no-verify-jwt`.
3. Set `WEBHOOK_SECRET` and ensure Supabase-managed `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets are available.
4. Create a Database Webhook on `notifications` inserts targeting the function URL; add the matching `x-webhook-secret` header.
5. Android: configure an FCM V1 service-account credential with `eas credentials`.
6. iOS: add an Apple Push Notification service key and an Apple Developer team through `eas credentials`.
7. Schedule due-soon/overdue inserts with Supabase Cron as a later operational step. Use idempotency (one notification type per task/date) before enabling it.

Apple/Google credentials are intentionally not committed and push cannot be tested on a simulator.

## Testing and quality checks

```bash
npm test
npm run typecheck
npm run build
```

Tests cover creation validation, assignment visibility, cross-employee denial, acknowledgement, starting, completion, overdue calculation, reopening, and invalid workflow transitions. Database access enforcement is additionally encoded in RLS and RPC predicates; run Supabase integration tests against a local instance when extending policies.

## Deployment

### Supabase production

1. Create a production Supabase project and link it: `supabase link --project-ref <ref>`.
2. Review and apply migrations: `supabase db push`.
3. Disable public signup, configure the allowed Site URL/redirect URLs, create the first administrator, and deploy the push function.
4. Use separate development and production projects. Enable backups and review Auth/Database logs.

### Web on Vercel

Import the repository, set the root to `apps/web` (or leave the root and set build command `npm run build -w @sunrise/web`), and add `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not add the service-role key unless a server-only route explicitly needs it. Set the production domain in Supabase Auth redirect settings.

### Android and iOS with EAS

```bash
cd apps/mobile
eas build --profile preview --platform android   # internal APK/testing
eas build --profile production --platform android # Play AAB
eas build --profile preview --platform ios       # registered-device internal build
eas build --profile production --platform ios    # TestFlight/App Store IPA
```

Use EAS internal distribution for factory testing. Upload the signed Android AAB to a Google Play internal-testing track before production. Submit iOS builds to TestFlight for review, then distribute through the public App Store or Apple's unlisted-app program if approved. Store listing, privacy declarations, screenshots, support URLs, Apple membership, and Google Play enrollment remain operator responsibilities. Publishing is never automatic from this repository.

## Operational principles

- Dates are stored in UTC and displayed in `Asia/Kolkata` initially.
- Overdue is derived when incomplete work passes its due date/time; it is never a stored status.
- Deletion is soft (`deleted_at`, `deleted_by`), keeping accountability records intact.
- Reassignment should default to New, clear acknowledgement timestamps, notify the new assignee, and append history. Completed work can be reopened to In Progress by an admin.
- Mobile update drafts remain in component state after a failed network submission; show a retry message and only clear after the RPC succeeds when connecting the production data adapter.

## License

Private internal software. All rights reserved.
