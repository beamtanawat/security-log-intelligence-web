# Security Log Intelligence Web — agent instructions

## Scope and provenance
This is a new web application repository derived in part from beamtanawat/security-log-intelligence. The original repository remains separate. Never describe copied parser/normalizer/detection code as newly invented here. See docs/provenance.md and docs/provenance-manifest.json.

Read README.md, docs/superpowers/specs/2026-10-30-security-log-web-design.md, docs/superpowers/plans/2026-10-30-security-log-web.md, docs/web/api-contract.md and docs/web/progress.md before implementation. The user approved React + FastAPI and authorized creation/population of this repository.

## Ownership
Codex owns src/, Python requirements, tests/test_web_*.py, scripts/, API contract and deployment. Claude Code owns web/ and frontend tests/config/lockfile. Do not edit another owner's files without coordination. API contract is shared authority; request changes instead of guessing.

## Runtime and evidence
Use Python 3.12. Keep one worker/service instance for process-local sessions and job admission. The initial engine is rules-only; there is no calibrated attack classification or connected LLM. Reuse the reviewed rules without changing their informational severity.
Never fabricate statistics, probabilities, benchmark accuracy, countries, provenance or completion claims. A finding, anomaly or deny is not a confirmed attack. Preserve opaque identifiers, original input and normalization issues. Derived epoch-seconds time is unverified.
No raw logs, secrets, credentials, model bundles or user uploads in Git. Only generated synthetic samples are allowed. Preserve upload size/row/deadline limits, signed ownership, expiration, bounded admission and spreadsheet-safe CSV.

## Working and verification
Inspect git status before editing; keep existing user changes. Use isolated branches/worktrees for concurrent agents. Test real observable behavior and preserve regression tests. Run Python tests using python -m pytest; frontend must run typecheck/tests/build when available. Report exact results and limitations; do not claim live deployment from a blueprint or HTTP health alone.
Do not change historical research artifacts or run benchmark training/TEST. Scientific dependencies are intentionally omitted because this extracted rules-only web app does not import them.

## Git and deployment
The user authorized the initial repository creation and first push. Subsequent commit/push/merge/publication requires user instructions. Do not automatically merge frontend into main or change repository visibility. Never force-push or overwrite user work.

## Handoff
Read docs/web/claude-code-prompt-th.md for frontend implementation. Claude should clone this repository and create a frontend branch. Codex integrates only after the frontend build and real API/browser flow have been checked.
