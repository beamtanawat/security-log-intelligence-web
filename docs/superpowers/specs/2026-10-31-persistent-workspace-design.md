# Persistent workspace — design in progress

## Scope and current state

Target a portfolio and synthetic/sanitized inputs on free services first, as selected by the project owner. The current application is a session-scoped, in-process demo; it does not have user accounts, durable history, shared queues, row-level authorization, or production incident management. Do not claim these features are available until implemented and exercised against actual infrastructure.

## Provider decision and limitations

Use Supabase Auth and PostgreSQL as the initial candidate: managed sign-in avoids building password storage and recovery from scratch, and PostgreSQL supports owner-scoped durable records and an atomic work queue. Do not commit project URLs, service keys, credentials, tokens, model artifacts or raw logs. Require separate test and production projects/configuration. No hosted resource has been provisioned by this document.

Check active free-tier limits before provisioning: Render's current Free Postgres expires after 30 days; Supabase Free may pause after insufficient database activity over a week. Both free services can sleep or impose limits. A free-tier project is not a reliability guarantee. Use a data backup/export plan and visible availability/error states rather than promising permanent history.

## Data policy and ownership

- Existing anonymous synthetic demo remains available with its current temporary retention; do not silently persist its uploads.
- Authenticated workspace stores only what the user explicitly chooses. Initial proposal: store analysis summary, source type, timestamps, quality, findings/predictions/anomalies and user annotations with a documented 7-day default retention. Do not retain raw uploaded CSV by default; require a separate opt-in and a private storage bucket before raw retention is introduced. No secrets in logs.
- Every persisted entity is owned by an authenticated user ID. Treat browser-provided owner IDs as untrusted. Verify Supabase-issued JWT signature against the trusted project JWKS and enforce issuer, audience, expiry and algorithm before using subject. Do not decode unverified claims as authorization.
- Database row-level security must enforce owner scoping for every read/write, including joins. Backend use of any privileged key must never bypass explicit owner checks. No service-role key in frontend or Git. Define session lifecycle, CSRF protections, logout and redirect allowlists in implementation and test before enabling sign-in.
- Deletion must remove derived data, annotations and any optional raw object. Because DB and object storage are not atomic together, record cleanup work durably and retry safely; report partial failure rather than claiming complete deletion.

## Job lifecycle and operation

Use persisted job state with explicit queued/running/completed/failed/cancelled/expired transitions and a bounded worker. Claim work with transaction-safe locking; use leases/heartbeat and idempotent retries with atomic result publication so a worker crash cannot show partial results. Worker restarts must not leak another user's data. Keep limits and quota enforcement explicit. Decide whether a separately hosted worker fits the free-tier budget before rollout; a sleeping web worker cannot promise continuous processing.

## Next contracts and verification

1. Document sign-in, ownership and list/detail/delete history interfaces and migration/rollback before exposing endpoints.
2. Test invalid/expired tokens, cross-user access and RLS through a real PostgreSQL/Supabase-compatible environment, including direct data access and malicious owner IDs.
3. Test upload privacy, no raw retention by default, safe deletion, restart recovery, duplicate jobs and queue concurrency. Seed synthetic data only.
4. Coordinate frontend integration via the shared API contract; preserve current demo and misleading-model safeguards.
5. Deploy to staging with actual platform credentials kept in provider secret stores; test both sources and rollback before switching production.

## Sources checked 2026-10-31

- https://render.com/docs/free
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/platform/billing-on-supabase
