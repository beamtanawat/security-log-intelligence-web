# Web API contract v1

Status: frontend integration contract, 2026-10-30. New API is separate from src/api/.
Base URL: same-origin `/api`. Development: Vite proxy `/api` to `http://127.0.0.1:8000`; keep browser requests relative. Browser fetch uses credentials: same-origin. Do not set multipart Content-Type manually.

## Ownership, errors, limits
Server-issued HttpOnly SameSite=Strict cookie `sli_session` owns each analysis. Production uses Secure. No login. Use one browser session; do not copy IDs between sessions. Foreign/unknown analysis: 404. Own expired analysis: 410 for a bounded tombstone period, then 404. Accepted submissions renew the same ownership cookie for their full retention window. Restart expires all sessions/jobs. Retention is 60 minutes from submission, with deletion deferred briefly for an already authorized active response; no new access is allowed after expiry. No durable history. No user data leaves the Python service in this release.
Only one upload/analysis may run at once; 429 includes Retry-After. Up to 8 retained jobs globally, after which 429 until expiry. Limit 10 MiB file / 50,000 CSV records. The upload body has a 30-second deadline; 408 UPLOAD_TIMEOUT releases the slot and removes partial files. Downloads have a 30-second response deadline. Full multipart request limit is file cap + 64 KiB. UTF-8, optional BOM. Supported schema is the current FortiGate export, not generic FortiGate key=value logs. Extra columns preserved in uploaded source. Header-only, malformed, missing/duplicate headers and invalid UTF-8 fail without partial successful results.
Application errors (untrusted Host is an upstream plain-text HTTP 400 exception): `{"error":{"code":"CODE","message":"Actionable message","fields":[]}}`. Error fields are strings. Status: 413 size/row cap; 422 unsupported CSV/filter; 409 analysis not complete; 403 foreign Origin; 429 busy/capacity. Structural validation may fail asynchronously: job state failed contains the same error object without outer wrapper. Never display a failed analysis as an empty successful one.
POST requests require same-origin Origin when present; direct CLI requests may omit Origin. Vite proxy should preserve browser Host/Origin (`changeOrigin: false`). No cross-origin CORS enabled.

## Endpoints
### GET /api/schema
`{source_type:"fortigate",required_columns:string[],max_file_bytes:10485760,max_records:50000,retention_seconds:3600,engine:"rules",severities:["INFORMATIONAL","LOW","MEDIUM","HIGH"],rules:[{rule_id,name,severity}],chat_available:false}`.
Both currently active rules are INFORMATIONAL; do not fabricate a high-risk count or attack taxonomy.
### GET /api/sample
Download a synthetic FortiGate CSV. Never real historical rows. `POST /api/demo` analyzes the same sample.
### POST /api/uploads
Multipart one file field named `file`. `.csv` filename required (case insensitive).
202: `{analysis_id:string,state:"queued",status_url:string}`. IDs are opaque strings, use returned status_url. A queued response may already be completed by the time polling starts. Never resubmit automatically after timeout; retry status if an ID was received.
### POST /api/demo
No body required. Same 202 response and session behavior. This generates and analyzes an explicitly synthetic sample; it does not return precomputed pretend analysis.
### GET /api/jobs/{analysis_id}
`{analysis_id,state:"queued"|"running"|"completed"|"failed"|"expired",stage:"validating"|"normalizing"|"detecting"|"summarizing"|null,error:null|{code,message,fields},expires_at:string}`.
Poll every 1000ms, stop on terminal states/unmount; handle HTTP 410 as expired. There is no percent-complete field. Streamed normalization/detection are interleaved, so stage normalizing covers both record-level operations.
### GET /api/analyses/{analysis_id}/summary
See examples/summary.json for complete shape. Fields:
- `analysis_id, filename, engine:"rules", is_demo:boolean, created_at, expires_at`.
- `time:{start:string|null,end:string|null,status:"UNVERIFIED_EPOCH_SECONDS"|"UNAVAILABLE",unknown_records:number,derived_records:number,bin_seconds:number|null}`.
- `counts:{input_records,analyzed_records,records_with_issues,denied_events,findings}` all integer. records_with_issues counts any normalizer issue (including expected missingness), not necessarily invalid rows. Additional `quality:{invalid_records:number,issues_by_code:[{code,count}]}` separates genuinely invalid conversions.
- `severity_counts:[{name,count}]` includes all four severity levels, zero allowed; `rule_counts:[{rule_id,count}]` includes active rules even when zero.
- `timeline:[{time:string,count:number}]` event counts in adaptive UTC bins, not finding counts. Derived timestamps assume epoch seconds without claiming source semantics verified; UI must visibly label that assumption. Invalid/missing times remain in unknown_records and other totals. Empty timeline is valid.
- `top_sources:[{identifier,count}]`, `top_ports:[{port:number,count}]`, `top_applications:[{name,count}]` top 10 across analyzed events; missing identifiers are excluded, not invented. No geolocation field.
- `summary:{mode:"deterministic",text:string,finding_ids:string[]}` bounded evidence-based text, at most five existing finding IDs. Label rules-based summary, not live AI chat.
### GET /api/analyses/{analysis_id}/findings
Query: optional severity (one of schema values), rule_id (one active rule), offset integer >=0 default 0, limit integer 1..100 default 50. Empty filter string means no filter. Unknown/duplicate query parameters rejected with 422. Stable order source_record_number ascending then rule_id ascending. Response `{items:Finding[],total:number,offset:number,limit:number}`; total is filtered total, not current page length.
### GET /api/analyses/{analysis_id}/findings/{finding_id}
Returns Finding. Same object as list, so drawer can open from a row and optionally refetch.
Finding:
`{finding_id:string,source_record_number:number,event_time:string|null,time_status:"UNVERIFIED_EPOCH_SECONDS"|"UNAVAILABLE",source_identifier:string|null,destination_identifier:string|null,destination_port:number|null,rule_id:string,severity:"INFORMATIONAL"|"LOW"|"MEDIUM"|"HIGH",reason:string,reason_code:string,evidence:Evidence[],normalization_issues:Issue[],uncertainties:string[],false_positive_note:string}`.
Evidence: `{field:string,value:string|number|boolean|null|object|array,source_fields:string[],mapping_operation:string,interpretation_status:string}`. Render as text/JSON, never HTML. Issue: `{source_field:string|null,issue_code:string,status:string,description:string}`. Source record number is a one-based data-record ordinal, not necessarily physical CSV line number (quoted fields may span lines).
### GET /api/analyses/{analysis_id}/export
Query `format=json|csv` required; severity/rule_id filters identical to table. No pagination on export; all matching findings. JSON is an array of Finding. CSV flattening: finding_id,source_record_number,event_time,source_identifier,destination_identifier,destination_port,rule_id,severity,reason,evidence_json. Spreadsheet-sensitive strings are prefixed with an apostrophe; JSON preserves original evidence. Server-generated download filename.
### GET /healthz
200 `{status:"ok",engine:"rules",frontend_ready:boolean}`. Healthy backend is not proof of a finished frontend.

## Frontend requirements
Use React/TypeScript/Vite/Tailwind/Recharts. Landing upload + demo + exact schema requirements + retention notice. Dashboard shows real counts, timeline, source/port/application lists, filtered paginated findings, evidence drawer, deterministic summary and export links. Make a print stylesheet for browser Save as PDF. No globe, invented attack probability, benchmark accuracy or enabled chat input. A disabled explanatory analyst panel is acceptable. Never fall back to fake data on API failure.
On desktop: dark navy panels and cyan accents. On narrow screens: stack panels, allow intentional table scroll. Convert displayed time to Asia/Bangkok if desired but label timezone and epoch-seconds assumption. Latest data date is not server date.

## Running backend
POSIX: `PYTHONPATH=src .venv/bin/python -m uvicorn web_api.app:create_app --factory --host 127.0.0.1 --port 8000`.
PowerShell: `$env:PYTHONPATH="src"; .\.venv\Scripts\python.exe -m uvicorn web_api.app:create_app --factory --host 127.0.0.1 --port 8000`.
See docs/web/backend-runbook.md for configuration and exact verification status when present. No public deployment has happened merely because this contract exists.
