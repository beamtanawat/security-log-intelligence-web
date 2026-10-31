# Web API contract v1.1 — FortiGate + UNSW-NB15

Status: updated after user approval of two-source support, 2026-10-30. Legacy requests default to FortiGate; new callers explicitly select unsw_nb15. Historical src/api/ belongs to the upstream research repo.
Base URL: same-origin `/api`. Development: Vite proxy `/api` to `http://127.0.0.1:8000`; keep browser requests relative. Browser fetch uses credentials: same-origin. Do not set multipart Content-Type manually.

## Ownership, errors, limits
Server-issued HttpOnly SameSite=Strict cookie `sli_session` owns each analysis. Production uses Secure. No login. Use one browser session; do not copy IDs between sessions. Foreign/unknown analysis: 404. Own expired analysis: 410 for a bounded tombstone period, then 404. Accepted submissions renew the same ownership cookie for their full retention window. Restart expires all sessions/jobs. Retention is 60 minutes from submission, with deletion deferred briefly for an already authorized active response; no new access is allowed after expiry. No durable history. No user data leaves the Python service in this release.
Only one upload/analysis may run at once; 429 includes Retry-After. Up to 8 retained jobs globally, after which 429 until expiry. Limit 10 MiB file / 50,000 CSV records. The upload body has a 30-second deadline; 408 UPLOAD_TIMEOUT releases the slot and removes partial files. Downloads have a 30-second response deadline. Full multipart request limit is file cap + 64 KiB. UTF-8, optional BOM. Supported schemas are the prepared FortiGate export and UNSW-NB15 predictive CSV; not arbitrary text/key=value logs. Full official UNSW TRAIN/TEST files can exceed the admission limits: use an explicitly selected subset or receive a clear rejection, never a silently truncated analysis. Extra columns preserved in uploaded source. Header-only, malformed, missing/duplicate headers and invalid UTF-8 fail without partial successful results.
Application errors (untrusted Host is an upstream plain-text HTTP 400 exception): `{"error":{"code":"CODE","message":"Actionable message","fields":[]}}`. Error fields are strings. Status: 413 size/row cap; 422 unsupported CSV/filter; 409 analysis not complete; 403 foreign Origin; 429 busy/capacity. Structural validation may fail asynchronously: job state failed contains the same error object without outer wrapper. Never display a failed analysis as an empty successful one.
POST requests require same-origin Origin when present; direct CLI requests may omit Origin. Vite proxy should preserve browser Host/Origin (`changeOrigin: false`). No cross-origin CORS enabled.

## Endpoints
### GET /api/schema
`{source_type:"fortigate",required_columns:string[],max_file_bytes:10485760,max_records:50000,retention_seconds:3600,engine:"rules",severities:["INFORMATIONAL","LOW","MEDIUM","HIGH"],rules:[{rule_id,name,severity}],chat_available:false}`.
All existing top-level schema fields stay unchanged for legacy FortiGate clients. Added `sources: SourceSchema[]`; see multi-source details below. Both currently active FortiGate rules are INFORMATIONAL, category SOURCE_PRODUCT_OBSERVATION (severity and category are different). UNSW currently has no detector rules; do not fabricate an attack taxonomy.
### GET /api/sample
Optional query `source_type=fortigate|unsw_nb15` defaults to fortigate. Download a synthetic CSV for the selected source. Never real historical rows. `POST /api/demo` analyzes the same sample.
### POST /api/uploads
Multipart exactly one file field named `file`, plus at most one optional text field `source_type=fortigate|unsw_nb15`. Omitted source_type defaults to fortigate. Reject unknown source values, duplicate/unknown fields; never infer source from filename or label presence. `.csv` filename required (case insensitive).
202: `{analysis_id:string,state:"queued",status_url:string}`. IDs are opaque strings, use returned status_url. A queued response may already be completed by the time polling starts. Never resubmit automatically after timeout; retry status if an ID was received.
### POST /api/demo
No body required. Optional query `source_type=fortigate|unsw_nb15` defaults to fortigate. Same 202 response and session behavior. This generates and analyzes an explicitly synthetic sample; it does not return precomputed pretend analysis.
### GET /api/jobs/{analysis_id}
`{analysis_id,state:"queued"|"running"|"completed"|"failed"|"expired",stage:"validating"|"normalizing"|"detecting"|"summarizing"|null,error:null|{code,message,fields},expires_at:string}`.
Poll every 1000ms, stop on terminal states/unmount; handle HTTP 410 as expired. There is no percent-complete field. Streamed normalization/detection are interleaved, so stage normalizing covers both record-level operations.
### GET /api/analyses/{analysis_id}/summary
See examples/summary.json for FortiGate and examples/unsw-summary.json for UNSW. Existing FortiGate fields keep their types/values; UNSW sets denied_events=null because unsupported. Fields:
- `analysis_id, filename, engine:"rules", is_demo:boolean, created_at, expires_at`.
- `time:{start:string|null,end:string|null,status:"UNVERIFIED_EPOCH_SECONDS"|"UNAVAILABLE",unknown_records:number,derived_records:number,bin_seconds:number|null}`.
- `counts:{input_records,analyzed_records,records_with_issues,denied_events,findings}` all integer. records_with_issues counts any normalizer issue (including expected missingness), not necessarily invalid rows. Additional `quality:{invalid_records:number,issues_by_code:[{code,count}]}` separates genuinely invalid conversions.
- `severity_counts:[{name,count}]` includes all four severity levels, zero allowed; `rule_counts:[{rule_id,count}]` includes active rules even when zero.
- `timeline:[{time:string,count:number}]` event counts in adaptive UTC bins, not finding counts. Derived timestamps assume epoch seconds without claiming source semantics verified; UI must visibly label that assumption. Invalid/missing times remain in unknown_records and other totals. Empty timeline is valid.
- `top_sources:[{identifier,count}]`, `top_ports:[{port:number,count}]`, `top_applications:[{name,count}]` top 10 across analyzed events; missing identifiers are excluded, not invented. No geolocation field.
- `summary:{mode:"deterministic",text:string,finding_ids:string[]}` bounded evidence-based text, at most five existing finding IDs. Label rules-based summary, not live AI chat.
### GET /api/analyses/{analysis_id}/findings
Query: optional severity (one of schema values), rule_id (one active rule), `source_record_number` (positive ASCII integer, at most 9 digits), offset integer >=0 default 0, limit integer 1..100 default 50. Use `source_record_number` to retrieve findings for a FortiGate anomaly row in the same analysis; zero matching findings is an empty result. Empty severity or rule_id means no filter; an empty source_record_number is invalid. Unknown/duplicate query parameters rejected with 422. Stable order source_record_number ascending then rule_id ascending. Response `{items:Finding[],total:number,offset:number,limit:number}`; total is filtered total, not current page length.
### GET /api/analyses/{analysis_id}/findings/{finding_id}
Returns Finding. Same object as list, so drawer can open from a row and optionally refetch.
Finding:
`{finding_id:string,source_record_number:number,event_time:string|null,time_status:"UNVERIFIED_EPOCH_SECONDS"|"UNAVAILABLE",source_identifier:string|null,destination_identifier:string|null,destination_port:number|null,rule_id:string,severity:"INFORMATIONAL"|"LOW"|"MEDIUM"|"HIGH",reason:string,reason_code:string,evidence:Evidence[],normalization_issues:Issue[],uncertainties:string[],false_positive_note:string}`.
Evidence: `{field:string,value:string|number|boolean|null|object|array,source_fields:string[],mapping_operation:string,interpretation_status:string}`. Render as text/JSON, never HTML. Issue: `{source_field:string|null,issue_code:string,status:string,description:string}`. Source record number is a one-based data-record ordinal, not necessarily physical CSV line number (quoted fields may span lines).
### GET /api/analyses/{analysis_id}/export
Query `format=json|csv` required; severity/rule_id filters match the table; `source_record_number` is not supported on export. No pagination on export; all matching findings. JSON is an array of Finding. CSV flattening: finding_id,source_record_number,event_time,source_identifier,destination_identifier,destination_port,rule_id,severity,reason,evidence_json. Spreadsheet-sensitive strings are prefixed with an apostrophe; JSON preserves original evidence. Server-generated download filename.
### GET /healthz
200 `{status:"ok",engine:"rules",frontend_ready:boolean}`. Healthy backend is not proof of a finished frontend.

## Frontend requirements
Use React/TypeScript/Vite/Tailwind/Recharts. Landing upload + demo + exact schema requirements + retention notice. Dashboard shows real counts, timeline, source/port/application lists, filtered paginated findings, evidence drawer, deterministic summary and export links. Make a print stylesheet for browser Save as PDF. No globe, invented attack probability, benchmark accuracy or enabled chat input. A disabled explanatory analyst panel is acceptable. Select panels using summary.capabilities and show UNSW uploaded labels as dataset annotations, not detector results. Never fall back to fake data on API failure.
On desktop: dark navy panels and cyan accents. On narrow screens: stack panels, allow intentional table scroll. Convert displayed time to Asia/Bangkok if desired but label timezone and epoch-seconds assumption. Latest data date is not server date.

## Running backend
POSIX: `PYTHONPATH=src .venv/bin/python -m uvicorn web_api.app:create_app --factory --host 127.0.0.1 --port 8000`.
PowerShell: `$env:PYTHONPATH="src"; .\.venv\Scripts\python.exe -m uvicorn web_api.app:create_app --factory --host 127.0.0.1 --port 8000`.
See docs/web/backend-runbook.md for configuration and exact verification status when present. No public deployment has happened merely because this contract exists.

## Two-source extension (v1.1)

### SourceSchema and selection
`GET /api/schema` adds `sources:[{source_type,name,engine,required_columns:string[],optional_columns:string[],rules:[{rule_id,name,severity,category}],capabilities:Capabilities}]`. Top-level fields still describe the default FortiGate source. Limits are shared across sources, not per-source quotas.
- fortigate: engine=rules; original required headers and two reviewed rules unchanged.
- unsw_nb15: engine=profile; 25 numeric and 3 categorical predictive columns from the upstream feature contract; id/label/attack_cat optional. Standard prepared 45-column files satisfy this schema. Extra fields remain in the raw upload and are not used as features. The API does not automatically identify or verify an uploaded official TRAIN/TEST split.

### Added summary fields
- `source_type:"fortigate"|"unsw_nb15"`
- `capabilities:{findings,records,labels,timeline,network_identifiers,ports,denied_events,model_inference,evaluation}` booleans. Schema capabilities describe supported panels; summary capabilities describe that analysis. Use the summary flag for labels availability.
- `inference:{available:false,reason:string}` when no model is configured. With an optional configured S2 bundle see the prediction contract below. No model is fitted on uploads. Historical published evaluation is independently available from /api/evaluation and does not change this flag.
- `labels:null|{source:"uploaded_columns_not_predictions",available:boolean,labeled_records:number,unlabeled_records:number,invalid_label_records:number,binary_counts:[{label:"NORMAL"|"ATTACK",count:number}],attack_category_counts:[{category:string,count:number}]}`. These are uploaded annotations, not independently verified ground truth or classifier output. Categories count populated category cells even if binary labels are absent/invalid; quality issues reveal conflicts. Invalid binary labels have normalized label=null and remain preserved as label_raw in records.

FortiGate has labels=null and the original findings view. UNSW has records=true, findings=false, evaluation=false, denied_events=null, no source/destination identifiers/ports, time unavailable and empty findings. model_inference is true only for a completed configured S2 prediction set. Do not derive timestamps from row IDs.

UNSW-only additions: `protocol_counts:[{protocol,count}]`, `state_counts:[{state,count}]`, `numeric_stats:[{field,count,missing,invalid,min:number|null,max:number|null,mean:number|null}]`. Counts/statistics exclude malformed/missing numeric cells and disclose them via invalid/missing and quality issues; finite nonnegative values only. No imputation, fitting, prediction, risk score, accuracy or F1.

### DELETE /api/analyses/{analysis_id}

Delete the session owner's completed or failed analysis and its temporary files. Returns 204. Active jobs/readers return 409 `ANALYSIS_IN_USE`; expired or already-deleted owned jobs return 410; foreign/unknown jobs return 404. DELETE uses the same origin checks as POST. Only remove the local recent-analysis entry after 204 or 410. This is not persistent account history.

### GET /api/analyses/{analysis_id}/records
UNSW flow profiles, not findings. Query offset>=0 default0 and limit1..100 default50. Reject unknown or duplicate queries; no severity/rule filters. Response `{items:FlowRecord[],total,offset,limit}` in input order. Ownership, expired410, failed/running409, foreign404 and read leases match findings. FortiGate returns404 UNSUPPORTED_PANEL because its records capability is false.

FlowRecord: `{source_record_number:number,source_type:"unsw_nb15",source_id:string|null,feature_values:{[predictive_column]:number|string|null},ground_truth:null|{label:0|1|null,label_raw:string,attack_cat:string|null},normalization_issues:Issue[]}`. `label`, `attack_cat` and `id` are never in feature_values. Numeric strings that cannot be parsed to finite nonnegative values become explicit quality issues, never zero.

The existing export endpoint exports detector findings only. For UNSW it correctly returns an empty findings array/CSV header, so hide finding export when capabilities.findings=false. Do not label this as a flow/label export. A separate flow export or model evaluation endpoint is not implemented.

### Frontend migration
Keep existing FortiGate flow, add a source selector from schema.sources, send optional source_type as multipart text, and use selected source for demo/sample URLs. For UNSW render flow table + protocol/service/state charts + numeric profiles and separate label/category charts only when labels.available. Hide unsupported timeline/network/deny/finding panels and show a truthful no-model notice. chat_available remains in schema; no chat/risk/geo/evaluation fields are added.

## GET /api/evaluation — historical benchmark panel

Global, read-only published results; not tied to an analysis ID. See examples/evaluation.json. This endpoint does not require upload labels, run inference, retrain or reevaluate TEST.
- scope=historical_benchmark, dataset=UNSW-NB15, split=OFFICIAL_TEST_ALL_ROWS, applies_to_current_upload=false, inference_available=false.
- models contains BASE-S1, BASE-S2, CHAIN-S1, CHAIN-S2. Each has metrics (accuracy, f1, precision, recall, average_precision, roc_auc) as ratios 0..1, row_count, threshold, confusion_matrix (tp,tn,fp,fn), source_report/source_report_sha256 and source_table_url.
- preferred_model=BASE-S2 comes from upstream development preference, not selection for the highest TEST score. BASE-S2 accuracy=0.8335641063013166 and f1=0.8675104179759637.
- computed_at=null: source aggregate tables do not record computation time. Do not replace with the current time.
- test_newly_unseen=false, statistical_significance_claim=false; show limitations and provenance. TEST was used in prior project stages and is not newly unseen overall.
- Snapshot/source-table hashes are checked; missing or changed artifacts produce503 EVALUATION_UNAVAILABLE.

UI may display an independent panel titled “ผลประเมินโมเดล — UNSW-NB15 (รายงานเดิม)” with model selector, Accuracy/F1 cards, row count and source-report link. Default to preferred_model; multiply ratios by100 for percentage formatting. Clearly state these scores are neither the current upload's accuracy nor FortiGate performance. Keep summary.capabilities.evaluation=false: it refers to evaluation of the current analysis, not this global historical panel. This is the sole authorized accuracy/F1 source in the current release.

## Prediction contract (v1.2 — local implementation)

This section describes the optional local backend implementation. Previously pushed or deployed versions may not include it. Examples named `prediction-*.json` illustrate the shape with synthetic values; they are not actual inference results. Do not claim the panel works in production until backend and frontend are integrated and verified there.

### Scope and capabilities

Start with the verified UNSW-NB15 BASE-S2 Random Forest. Predictions use the exact 28 predictive features and frozen preprocessing state; uploaded `label`, `attack_cat` and IDs are excluded from features. No training occurs on uploads. Keep the existing `capabilities.model_inference` flag; add optional `capabilities.predictions:boolean`, omitted or false in existing releases. In an analysis summary it is true only when prediction results for that analysis exist and are retrievable. Schema capabilities represent source support, not model readiness; use the summary flag for display.

The planned `summary.inference` when predictions are available is `{available:true,model:ModelMetadata,threshold:0.5,scored_records:number,unscored_records:number,prediction_counts:[{class_name:"NORMAL"|"ATTACK",count:number}],evaluation:{status:"not_evaluated"},disclaimer:string}`. Counts cover scored rows only; scored_records + unscored_records equals analyzed records. No Accuracy/F1 is calculated for an uploaded file, even when it has labels. Uploaded labels remain separate annotations. `summary.inference.available=false` retains the existing `reason` and may add `error_code`; no prediction counts are supplied. Historical `/api/evaluation` retains its separate meaning.

`ModelMetadata` is `{model_id:"BASE-S2",family:"RANDOM_FOREST",artifact_sha256:string,training_dataset:"UNSW-NB15",trained_at:string|null}`. `trained_at` is null unless verified from reliable model provenance; do not substitute filesystem timestamps. BASE-S2 artifact SHA-256 is `e3e56eaf42331d708d458ab7b824d7df14e61e3c5329a04414e87e9bfcfa5b8d` for the verified bundle.

### GET /api/analyses/{analysis_id}/predictions

Paginated endpoint; query `offset` defaults to 0 and `limit` defaults to 50, with the same validation and ownership/expiry semantics as `/records`. Response `{items:Prediction[],total,offset,limit}` in input order. `total` counts every input record, including unscored records. `source_record_number` is the 1-based input record number and joins the corresponding `/records` item; it is not a network identifier.

A scored item is `{source_record_number:number,status:"scored",class_name:"NORMAL"|"ATTACK",score:number,score_kind:"model_attack_score",threshold:0.5,error_code:null}`. `score` is the S2 positive-class predict_proba output between 0 and 1, not a calibrated real-world probability or confirmed incident; class is ATTACK when score >= 0.5. An unscored item is `{source_record_number:number,status:"unscored",class_name:null,score:null,score_kind:null,threshold:null,error_code:"INVALID_PREDICTIVE_FEATURE"}`. Invalid numeric inputs must not be silently converted to missing values. Missing values may be handled only by the exact frozen preprocessing, and missing required CSV columns retain the existing upload failure. Do not infer, fabricate, or reuse other rows' scores.

When the model is not configured, fails integrity/version checks or cannot load, profiling remains available with `capabilities.predictions=false` and an actionable inference reason. A request for predictions returns an error envelope with HTTP 503 and `MODEL_NOT_CONFIGURED`, `MODEL_INTEGRITY_FAILED`, or `MODEL_LOAD_FAILED` as appropriate. An unexpected inference failure must not create a successful partial set: return the existing job error envelope with `INFERENCE_FAILED`, or clearly report the failure in summary if profiling completes; no stale or synthetic predictions. If source does not support predictions, return 404 `UNSUPPORTED_PANEL`. Existing 404/410 ownership and expiration behavior takes precedence. See `prediction-page.json`, `prediction-inference.json`, and `prediction-error.json`.

### FortiGate and user-facing explanation

FortiGate Isolation Forest is a separate anomaly model. Its score indicates relative anomaly according to its own documented score direction, not a classifier output, confirmed attack, or attack probability. Anomaly scoring is exposed separately as described below; do not mark FortiGate S2 predictions available or present S2 labels for it.

Display this disclaimer alongside S2 predictions: “ผลนี้เป็นการคาดการณ์จากโมเดลที่ฝึกด้วย UNSW-NB15 ไม่ใช่การยืนยันการโจมตี คะแนนไม่ได้รับการปรับเทียบเป็นความน่าจะเป็นจริง และไม่ได้ประเมิน Accuracy/F1 ของไฟล์นี้” Show unscored rows and reasons rather than hiding failures.

### Implementation status for local S2 integration

The optional local backend implementation provides the UNSW S2 predictions described above when `SLI_UNSW_MODEL_DIR` points to a trusted directory containing the four exact artifacts (`final.joblib`, `final_feature_state.json`, `final_metadata.json`, `selection_lock.json`) and the pinned packages in `requirements-inference.txt` are installed alongside `requirements-web.txt`. The artifacts are private runtime assets and must not be committed or accepted as uploads. Their SHA-256 identities are verified before loading the serialized model. Without an explicit configured directory, inference is disabled and profiling still works. Deployment requires separately provisioning those files and installing the optional dependencies; the existing Render blueprint does not do that. FortiGate anomaly inference requires its own model bundle and configuration described below.


## FortiGate anomaly scoring (local implementation)

Available only when the verified optional model bundle is configured through `SLI_FORTIGATE_MODEL_DIR`; install `requirements-web.txt` and `requirements-inference.txt`. The directory must contain `stage_1_8_isolation_forest.joblib`, `stage_1_8_model_metadata.json`, `stage_1_8_manifest.json` and `stage_1_7_ai_feature_metadata.json`. SHA-256 is checked before deserializing. These are private runtime assets and are not committed.

`summary.capabilities.anomalies` is true only if a full per-record result exists. `summary.anomaly_inference` when available has `{available:true, model:{model_id,family,artifact_sha256,training_dataset,trained_at:null}, scored_records,unscored_records,score_semantics,reference_percentile_semantics,disclaimer}`. Counts sum to analyzed records. The scores are independent of the FortiGate rules and are not attack labels, probabilities, accuracy or F1. When unavailable the summary contains `{available:false,reason,error_code}`. Existing rule findings remain usable.

`GET /api/analyses/{id}/anomalies` supports `offset` and `limit` exactly as `/records` and returns `{items,total,offset,limit}` including unscored rows, in source order. Each scored item has `{source_record_number,status:"scored",raw_abnormality,reference_percentile,error_code:null}`. Raw abnormality is negative IsolationForest `score_samples` (higher means more abnormal). Percentile is the percentage of frozen reference scores less than or equal to this score, not a probability; ties may yield identical percentiles. An unscored item has `{source_record_number,status:"unscored",raw_abnormality:null,reference_percentile:null,error_code:"INVALID_ANOMALY_FEATURE"}`. Source record number starts at 1. No threshold or attack classification is implied.

A request with no configured bundle, corrupt bundle or unloadable model returns 503 with `MODEL_NOT_CONFIGURED`, `MODEL_INTEGRITY_FAILED` or `MODEL_LOAD_FAILED`. An unexpected scoring failure returns 503 `INFERENCE_FAILED`. A non-FortiGate source returns 404 `UNSUPPORTED_PANEL`. Ownership/expiry behavior matches `/records`. UI must display the returned disclaimer and unscored count, and never replace missing results with example values. Example JSON is illustrative synthetic data, not an actual model result. See `examples/anomaly-page.json` and `examples/anomaly-inference.json`.

### Presentation, joins and errors

- Only use `capabilities.anomalies === true` and `summary.anomaly_inference.available === true` to show results. On failure, show the `reason` and `error_code` without displaying stale scores. Older summaries may omit both fields.
- `source_record_number` is a 1-based CSV data-row index, excluding the header, scoped to the same `analysis_id`. Query `/findings?source_record_number=N` for matching findings within the same analysis; several findings may refer to one row, and some rows have no findings. FortiGate does not expose `/records` in the current API. Never join on IP or compare row numbers across analyses.
- `raw_abnormality` is a finite, unitless score, with no fixed range guaranteed by this API; higher means more abnormal. `reference_percentile` is in `[0,100]`, also higher for more abnormal relative to the frozen reference. Neither is an attack probability. There is no threshold, anomaly flag, severity or global rank. Unscored values are null.
- The API returns source order, not anomaly order. On each fetched page the UI may show scored rows by descending `reference_percentile`, then `raw_abnormality`, followed by unscored rows, with a visible indication that ordering is limited to that page. Do not imply a global top ranking across pages; the endpoint has no server-side sort.
- Always show the returned disclaimer alongside the scores: “คะแนนแสดงความผิดปกติเทียบกับข้อมูลอ้างอิงเดิม ไม่ใช่ความน่าจะเป็นหรือการยืนยันการโจมตี ต้องตรวจสอบบริบทเพิ่มเติม”.
- Errors use `{error:{code,message,fields}}`: 503 `MODEL_NOT_CONFIGURED` (no path), `MODEL_INTEGRITY_FAILED` (hash differs), `MODEL_LOAD_FAILED` (missing files, incompatible dependency or model/state cannot load), `INFERENCE_FAILED` (unexpected scoring failure); 404 `UNSUPPORTED_PANEL` for UNSW. Existing session/expiry errors 404 `NOT_FOUND`, 410 `EXPIRED`, and 409 `NOT_READY` apply. Invalid/duplicate query fields yield 422 `INVALID_FILTER`; invalid offset/limit yields 422 `INVALID_PAGINATION`.
- Examples: `anomaly-inference.json` is summary's anomaly_inference; `anomaly-page.json` contains one scored and one unscored synthetic item; `anomaly-error.json` shows the 503 envelope. Example scores are illustrative, not measured.
- The source modules `src/ai_features/models.py` and `src/ai_features/transform.py` are reused unchanged from upstream `beamtanawat/security-log-intelligence` commit `47d931dd21175146766837773ce5825a5276bdf3`. The Stage 1.7 feature metadata and model artifacts remain separate runtime files.

### Historical evaluation response clarification

The verified historical snapshot remains immutable. The API replaces its outdated web-availability sentence in the response only: historical row-level predictions and original computation time are unavailable in the source tables; current inference availability is reported per analysis. The historical `inference_available:false` means this evaluation endpoint does not run inference, not that the deployed application has no models.
