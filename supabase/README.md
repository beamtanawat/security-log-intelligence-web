# Workspace schema (staging preparation)

The two migrations create owner-scoped analysis, derived item and review tables with RLS. They and the staging history API have only been tested with a disposable local PostgreSQL auth shim. **They have not been applied to Supabase; frontend login and history are not yet implemented.** Do not deploy them until real Supabase validation and frontend integration are complete.

The migration stores derived data only; it does not provide raw CSV storage. Signed-in users may read their own unexpired analyses and derived items and create or edit reviews on those items. Only the trusted backend service role may create or change analysis data. A service role bypasses RLS: every backend query using it must derive ownership from a verified identity and scope explicitly to that owner. Never expose a service-role key to the browser.

The 7-day `expires_at` default hides expired rows. The staging backend attempts bounded physical cleanup every 30 minutes while it is running; a free service may sleep or be stopped, so physical deletion can be delayed and is not guaranteed at exactly 7 days. A reliable external scheduler and monitoring are needed for a strict deletion deadline. Owner deletion cascades through derived rows and reviews; raw CSV is not stored in these tables.

Run `bash scripts/test_workspace_db.sh` only with Docker available. It creates its own disposable PostgreSQL container with `--network none`, seeds synthetic test rows, tests isolation and cascade deletion, and cleans up its own container. It does not touch Supabase. A real staging test with Supabase authentication and RLS remains required.
