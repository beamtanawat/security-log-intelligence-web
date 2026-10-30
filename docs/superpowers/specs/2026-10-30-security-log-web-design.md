# Security Log Intelligence Web MVP — design

Status: records the React + FastAPI direction approved in chat on 2026-10-30. Concrete defaults below are implementation recommendations, not claims that they already exist.

## Intent
Turn the existing research project into a deployed interview demo: upload a supported FortiGate CSV, analyze its actual contents, inspect findings and evidence, export results. Use the supplied dark dashboard as visual inspiration, not as a source of metrics or attack labels.

## Existing evidence
Repository: https://github.com/beamtanawat/security-log-intelligence
Inspected main tree: 47d931dd21175146766837773ce5825a5276bdf3. Recheck HEAD before implementation.
Existing modules include parsers/fortigate.py, normalization/fortigate.py, detection/engine.py, storage/, api/app.py and anomaly/.
The existing API is read-only and localhost-bound. Stage 1.8 score bundle publication rejects non-Windows platforms; models, raw input and intermediate bundles are not committed. No local project copy was available in this planning workspace. Static inspection only; no runtime validation has occurred.

## Approaches
- Selected: React/TypeScript/Vite + Tailwind + Recharts, existing Python/FastAPI analysis modules, one origin serving API and built frontend. More UI flexibility and clear ownership between Codex and Claude Code.
- Alternative: Streamlit. Faster Python-only assembly, less control over the reference layout. Not selected.

## Scope and defaults
- Python 3.12. Preserve existing scientific dependency pins until their availability and runtime compatibility are checked.
- First release supports only the existing FortiGate CSV schema. UI offers its exact required headers and a downloadable synthetic example.
- Upload cap: 10 MiB and 50,000 records, whichever is reached first; bounded streaming reads, UTF-8 with optional BOM. These limits are planning defaults, not measured performance claims.
- One analysis job at a time initially; excess submissions get 429. Single application worker. Expose states queued, running, completed, failed, expired.
- Separate temporary directory and unguessable analysis ID for every upload; opaque server-issued HttpOnly session cookie scopes every lookup and export. Cross-session access returns 404. Upload ownership is not inferred from a caller-supplied ID.
- No accounts or durable history today. Deny new access after 60 minutes, expire on access and periodic cleanup, and remove previous jobs at startup. An already authorized active read may defer physical deletion until completion; downloads have a 30-second response deadline. Upload bodies must arrive within 30 seconds or release their reservation with HTTP 408. Restart may expire all jobs. Clearly tell users before upload.
- Do not log uploaded contents or publicize original files. Synthetic sample only in Git. Original filename is display metadata, never a filesystem path.
- Reuse parser, normalizer and rule engine through a new web orchestration layer. Preserve input records, conversion issues, source record numbers and evidence. Do not silently omit invalid records or portray skipped records as analyzed.
- Start with rule-based results. ML is optional after verifying model artifacts, feature compatibility, runtime and inference semantics. Do not retrain or rerun benchmark TEST as part of this work.
- No LLM required for launch. Deterministic summaries are labeled as such. Optional LLM consumes bounded evidence only, references real finding IDs, treats log text as untrusted data and uses server-side credentials, timeouts and request limits. Tell users before any external model submission.

## Screens
Upload: value proposition, schema requirements, drag/drop and file picker, sample button, validation errors, progress/status, retention notice.
Dashboard: filename, dataset time range, analysis timestamp, log counts and quality counts; denied event count; finding counts by severity; time series, rule categories, top source identifiers/ports/applications; paginated and filtered findings table; evidence detail drawer; summary panel; JSON/CSV exports and print stylesheet.
Support narrow screens, keyboard interaction, chart labels, loading, empty and error states. Keep filter state tied to the active analysis.
Timestamp ambiguity is shown explicitly. Unknown geography stays unknown. Use dataset dates, not an invented 'today'. Counts distinguish events from findings because one event can match multiple rules.

## Honest interpretation
Anomaly is not attack. Rule match is not confirmed attack. Anomaly score is not attack probability. No uploaded-data accuracy/F1 without defensible ground truth. UNSW evaluation remains separate from FortiGate claims. No invented country, confidence score, categories or summary numbers.

## Delivery and ownership
Codex: backend, API contract, synthetic generator, integration, tests and deployment configuration.
Claude Code: web/ UI and frontend tests, consuming agreed contract.
Use separate branches/worktrees; neither edits the other's owned files. Codex integrates. API changes go through the contract owner before UI changes. Do not automatically commit or push under repository AGENTS.md.
First finish upload → real rule analysis → dashboard → evidence → export → live smoke test. Defer globe, realtime ingestion, accounts, multi-source adapters and unrestricted chat.
Deployment target recommendation: a Python-capable service such as Render serving the Vite build via FastAPI; verify account, quotas and repository access before selecting the actual host. Public deployment and Git writes follow the user's authorization and platform controls.

## Acceptance
A visitor can try a labeled synthetic sample and upload a valid supported file. Counts and charts reconcile with that analysis, detail links identify original record numbers, another session cannot access it, invalid and oversized files fail cleanly, export honors ownership and filters, and the same path works at the live URL. README explains stack, limitations and deployment. No source code or configuration contains secrets.
