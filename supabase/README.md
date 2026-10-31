# Workspace schema (staging preparation)

The migration creates owner-scoped analysis, derived item and review tables with RLS. It has only been tested with a disposable local PostgreSQL auth shim. **It has not been applied to Supabase and does not implement application login, history, background jobs, or retention cleanup.** Do not deploy it or claim persistent history until real Supabase validation and backend/frontend integration are complete.

The migration stores derived data only; it does not provide raw CSV storage. Signed-in users may read their own unexpired analyses and derived items and create or edit reviews on those items. Only the trusted backend service role may create or change analysis data. A service role bypasses RLS: every backend query using it must derive ownership from a verified identity and scope explicitly to that owner. Never expose a service-role key to the browser.

The 7-day `expires_at` default hides expired rows via RLS; it **does not physically delete them**. A tested scheduled cleanup mechanism is required before any retention promise. Owner deletion cascades through derived rows and reviews when performed by the trusted backend; optional raw-object deletion requires a separately tested cleanup mechanism.

Run `bash scripts/test_workspace_db.sh` only with Docker available. It creates its own disposable PostgreSQL container with `--network none`, seeds synthetic test rows, tests isolation and cascade deletion, and cleans up its own container. It does not touch Supabase. A real staging test with Supabase authentication and RLS remains required.
