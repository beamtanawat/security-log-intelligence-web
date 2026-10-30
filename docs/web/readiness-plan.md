# Backend readiness while frontend is developed

Scope authorized by the user: continue backend/deployment verification while Claude implements web/. Work on codex/backend-readiness; leave web/ and the shared API response shapes unchanged. No public deployment or Git write is implied by local preparation.

1. Measure synthetic 1,000- and 50,000-record sparse inputs with both existing informational rules matching. Record actual time, peak RSS and generated-output size; do not convert these observations into a production SLA. Keep all generated row-level data temporary.
2. Exercise production HTTPS cookie/origin behavior and shutdown cleanup. Add failing regressions before fixing demonstrated failures. Reserve exact /api as JSON 404 so the SPA cannot mask that namespace. Keep reader/disconnect cleanup covered.
3. Add backend-only GitHub Actions CI on Linux/Windows Python 3.12 with read-only repository permissions, pip check and the real backend suite. This is configuration; do not claim the hosted workflow ran until pushed and observed.
4. Prepare a bounded smoke-test CLI and deployment checklist for the eventual real URL. It must use only generated sample data, validate results/isolation/exports and close its clients. Only run against a user-owned development/deployment target.
5. Run all backend tests, the smoke script against a temporary local Uvicorn service, dependency checks and diff validation. Record results and remaining frontend/provider checks.

Selected approach: extend the existing tests and deployment docs, not a second app or a new analysis engine. This keeps Claude's API stable and catches operational failures before integration.
