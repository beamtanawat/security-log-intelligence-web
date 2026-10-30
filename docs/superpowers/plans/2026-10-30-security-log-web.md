# Security Log Intelligence Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user selected two external coding agents: Codex for backend/integration and Claude Code for frontend; this does not require spawning additional agents.

**Goal:** Deliver a deployed, evidence-based upload-to-dashboard FortiGate demo.

**Architecture:** Add a new web API and orchestration layer alongside the existing read-only API. React consumes a shared contract; one Python service serves API and Vite build. Jobs and results are temporary and isolated by browser session.

**Tech Stack:** Python 3.12, FastAPI, existing parser/normalizer/detector, React, TypeScript, Vite, Tailwind CSS, Recharts, pytest, frontend component/browser tests where meaningful.

**Spec:** ../specs/2026-10-30-security-log-web-design.md

## Repository extraction note
Work now takes place in beamtanawat/security-log-intelligence-web. The upstream pure analysis modules are reused with provenance; src/api/, scientific runners and research data are not included. Install the lean web requirements; no scientific package pins are changed in the original repository. Run the extracted web tests independently.

## Global Constraints
- Python 3.12. Preserve existing scientific dependency pins until their availability and runtime compatibility are checked.
- Upload cap: 10 MiB and 50,000 records, whichever is reached first; bounded streaming reads, UTF-8 with optional BOM.
- One analysis job at a time initially; excess submissions get 429. Single application worker.
- Retain uploads/results for at most 60 minutes.
- No automatic commits/pushes; preserve raw evidence and frozen experiments.
- No model retraining or benchmark TEST reruns. No fabricated metrics.
- Scope every analysis route/export to a server-issued session; another session receives 404.

## Review Focus
- Missing/BOM/duplicate headers and malformed CSV: actionable error, no success with silently dropped rows (Task 2).
- Browser retry, queue saturation and expired job: bounded work, terminal state, useful UI recovery (Tasks 2 and 4).
- Tokenized identifiers and uncertain timestamps: no invented countries or misleading time charts (Tasks 3 and 4).
- Cross-session reads and CSV spreadsheet formulas: private results and inert exported cells (Tasks 2 and 3).
- Cold restart, small-screen layout and inaccessible host: explicit expiry, usable UI and verified live flow (Task 5).

## File map and ownership
Codex creates docs/web/api-contract.md, docs/web/examples/*.json, scripts/generate_web_sample.py, src/web_api/{app,contracts,jobs,pipeline,summary,exports}.py, tests/test_web_*.py, deployment configuration; changes requirements only with explained need.
Claude creates web/package.json, web/src/api/{client,types}.ts, web/src/pages/{UploadPage,DashboardPage}.tsx, web/src/components/{UploadForm,AnalysisStatus,SummaryCards,AnalysisCharts,FindingsTable,FindingDetail,AnalystPanel}.tsx, web/src/styles.css, frontend configuration and focused UI tests.
Existing src/api/ and frozen ML contracts remain intact. Check for nested AGENTS.md before editing.

### Task 1 — Codex: establish runnable baseline and freeze interface
**Files:** existing AGENTS.md, requirements*.txt, src/parsers/fortigate.py, src/detection/{engine,rules}.py; create docs/web/api-contract.md and docs/web/examples/*.json.
**Interfaces:** produces the HTTP contract below and TypeScript-compatible example responses. Codex owns schema changes; Claude mirrors them in types.ts.
- [x] Obtain repository into an isolated working copy; record branch/SHA and git status. Read AGENTS.md and relevant modules fully; inspect existing tests before choosing invocation signatures.
- [x] Set up Python 3.12, install declared dependencies and run pip check. Report unavailable pins rather than silently upgrading them.
- [x] Run existing parser/normalizer/detection tests selected from actual tests; record baseline failures separately from new failures.
- [x] Write the complete contract, including nullable fields, pagination, errors, session ownership and examples for empty/completed/failed jobs. Validate examples as JSON. Freeze before Claude connects the UI.

#### HTTP contract to formalize in Task 1
- POST /api/uploads: multipart file; 202 {analysis_id, state:"queued", status_url}; set session cookie if absent. 413 size/row cap, 422 malformed/unsupported input, 429 busy. Validation may also terminate the job with a sanitized error.
- POST /api/demo: start a new session-owned analysis of the synthetic sample; same response.
- GET /api/jobs/{analysis_id}: {analysis_id, state, stage, error:null|{code,message,fields}}. stage is validating|normalizing|detecting|summarizing|null. Never invent percent progress. Expired own jobs return 410 while a bounded tombstone exists; unknown/foreign IDs return 404.
- GET /api/analyses/{analysis_id}/summary: {analysis_id, filename, engine:"rules", created_at, expires_at, time:{start,end,status}, counts:{input_records,analyzed_records,records_with_issues,denied_events,findings}, severity_counts:[{name,count}], timeline:[{time,count}], rule_counts:[{rule_id,count}], top_sources:[{identifier,count}], top_ports:[{port,count}], top_applications:[{name,count}], summary:{mode:"deterministic",text,finding_ids}}. Time values nullable; unknown time records reported separately in finalized contract.
- GET /api/analyses/{analysis_id}/findings?severity=&rule_id=&offset=0&limit=50: {items:[Finding],total,offset,limit}; max limit 100, stable ordering. Finding: {finding_id,source_record_number,event_time:null|string,source_identifier:null|string,destination_identifier:null|string,destination_port:null|number,rule_id,severity,reason,evidence:[{field,value}]}. Mirror actual detector severities, do not invent a conflicting enum.
- GET /api/analyses/{analysis_id}/findings/{finding_id}: one Finding with preserved evidence and relevant normalization issues.
- GET /api/analyses/{analysis_id}/export?format=json|csv&severity=&rule_id=: selected findings only; validate filters and scope exactly as table route.
- Error shape: {error:{code,message,fields:[]}}. Unready result endpoints return 409. Dates are ISO 8601 with explicit timezone; analysis time is separate from uncertain event time.
- Chat endpoint is deferred unless optional Task 6 is enabled. Missing LLM does not block launch.

### Task 2 — Codex: bounded upload and job isolation
**Files:** src/web_api/{app,contracts,jobs,pipeline}.py; scripts/generate_web_sample.py; tests/test_web_uploads.py, tests/test_web_jobs.py.
**Interfaces:** create_app(settings: WebSettings) -> FastAPI; analyze_csv(path: Path) -> AnalysisResult; JobStore provides create/get/expire scoped by session. Define WebSettings and AnalysisResult in contracts.py against Task 1.
- [x] Add failing API tests: valid sample reaches completed; absent or duplicate required header fails; BOM succeeds; malformed row is reported; limit+1 byte/record fails; second session cannot read status/results; concurrent submission returns 429; expired job returns 410 for owner.
- [x] Run pytest tests/test_web_uploads.py tests/test_web_jobs.py -q; confirm failures identify missing behavior.
- [x] Implement bounded streamed upload, server-generated paths, session ownership, one bounded worker, cleanup and sanitized terminal errors. Generate a small synthetic sample from actual required schema; do not copy real rows.
- [x] Reuse the existing pure parser/normalizer/detector, adapting orchestration instead of calling historical artifact builders. Verify detector setup from existing tests, preserving issues and record numbers.
- [x] Run the same tests; expect PASS. Confirm oversized files are rejected before unbounded memory use. Review diff; leave commits to explicit user instruction.

### Task 3 — Codex: summaries, evidence and export
**Files:** src/web_api/{summary,exports,app}.py; tests/test_web_summary.py, tests/test_web_exports.py.
**Interfaces:** build_summary(result: AnalysisResult) -> AnalysisSummary; export_findings(findings: Sequence[Finding], format: Literal["csv","json"]) -> bytes; HTTP shapes from Task 1.
- [x] Add failing tests: one event matching two rules counts as one analyzed event and two findings; empty findings is valid; mixed unknown timestamps are accounted for; tokenized sources remain opaque; filters match export; foreign-session export returns 404; cells beginning with =,+,-,@ cannot execute as spreadsheet formulas.
- [x] Run pytest tests/test_web_summary.py tests/test_web_exports.py -q; confirm intended failures.
- [x] Implement real aggregates, stable filtering/pagination, evidence retrieval and bounded downloadable results. Use source-native rule severity; distinguish denied events from findings. Explain uncertainty in deterministic summaries and include real finding references.
- [x] Run the same tests; expect PASS, and reconcile fixture totals by hand once.

### Task 4 — Claude Code: upload and dashboard
**Files:** web/ files in ownership map.
**Interfaces:** consumes Task 1 contract/examples; exports a Vite dist/ build; same-origin relative /api URLs, configurable dev proxy only.
- [ ] Read spec/contract; scaffold frontend with lockfile and actual available compatible package versions. Keep all mock data in explicitly labeled development/demo fixtures.
- [ ] Build upload page with schema link, retention notice, sample action, keyboard-accessible file picker, progress stages and actionable errors. Do not manually set multipart Content-Type.
- [ ] Build responsive dashboard, distinct event/finding counts, honest charts, filters/pagination, evidence drawer, deterministic-summary panel and export controls. Print stylesheet supports browser Save as PDF.
- [ ] Add meaningful interaction tests: upload error recovery, running-to-completed navigation, expired-job recovery, null timestamp rendering and filter changes resetting pagination. Use the chosen frontend test runner and document its command.
- [ ] Connect client.ts to real endpoints; cancel polling on terminal states/unmount. A failed backend must not silently fall back to sample results.
- [ ] Run frontend tests, TypeScript check and npm run build; expect exit 0. Check 390px and desktop widths plus keyboard access. Hand Codex a file list and exact validation results.

### Task 5 — Codex leads, Claude fixes UI: integrate and deploy
**Files:** src/web_api/app.py, deployment config, README.md, frontend API integration if coordinated with Claude.
**Interfaces:** production serves /api/* and Vite assets from one origin, binds provider PORT, explicit production allowed hosts and single worker; API errors never fall through to index.html.
- [ ] Add integration checks for production asset serving, unknown /api paths, request size handling, expired sessions and restart behavior; run and confirm expected failures before implementing serving configuration.
- [ ] Implement production entry point and health endpoint; build frontend in deployment and set required settings. Use secure cookies in production. Check provider account/limits; do not assume credentials exist.
- [ ] Run new backend tests, relevant existing regressions, frontend checks/build and pip check. Do not claim an unrun suite passed.
- [ ] Exercise real browser flow locally: sample, valid upload, invalid upload, filters, evidence, exports, refresh and another session. Check spreadsheet export cells and an HTML-looking identifier render as inert text.
- [ ] Prepare hosting configuration; deploy when user authorization/platform requirements permit. Test health, assets and complete upload flow at the actual live URL. Confirm data cleanup and restart behavior; check logs contain no raw uploads.
- [ ] Document exact stack, limits, synthetic demo provenance, startup commands, tests, deployment and known omissions. Report URL and GitHub revision separately; do not claim GitHub changed without a push.

### Task 6 — optional only after launch path passes
- [ ] ML: inspect available trusted model artifacts and feature/runtime contracts; establish inference-only behavior on new inputs and small datasets. Do not bypass Windows publication guards or frozen artifact identity checks. If unavailable, keep rules-only engine visible.
- [ ] LLM: choose an accessible small structured-output model, add server-only key, bounded evidence prompts, real finding citations, explicit external-processing notice, timeout/rate limits, and deterministic failure fallback. Test fabricated finding references are rejected and log instructions cannot trigger tools.
- [ ] Defer 3D globe, accounts and realtime ingestion to later work.

## Coordination and time budget
Budget is an estimate, not a completion promise: 45–60 min baseline/contract; 2–3 h parallel API/UI; 1–2 h integration; 1–2 h deployment and smoke test. At integration cutoff, drop optional ML/LLM/globe first. Do not drop evidence, input validation, session isolation or live verification.
Execution status: Tasks 1–3 completed by Codex; Task 4 awaits Claude; Task 5 backend preparation verified but integration/deployment pending. See docs/web/progress.md for evidence and baseline failures.
