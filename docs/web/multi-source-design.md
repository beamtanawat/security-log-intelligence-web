# FortiGate + UNSW-NB15 web support

User approved using the two existing datasets on 2026-10-30. This extends the existing web API; it does not merge datasets, fit models, unlock historical TEST data or claim calibrated predictions.

- source_type enum: fortigate, unsw_nb15. Old uploads that omit source_type remain FortiGate.
- GET /api/schema keeps all current top-level fields and adds sources. Each source has required_columns, optional_columns, rules, engine and capabilities. FortiGate's reviewed category SOURCE_PRODUCT_OBSERVATION may be exposed as rule metadata; severity remains INFORMATIONAL.
- POST /api/uploads accepts exactly one file and at most one optional source_type text field. Reject duplicates, unsupported source types and unknown form fields. No auto-detection or fallback to another parser.
- GET /api/sample?source_type=... and POST /api/demo?source_type=... default to FortiGate. UNSW demo is wholly synthetic, not redistributed benchmark data.
- UNSW requires the same 28 predictive columns documented by the upstream feature contract. The usual 45-column prepared dataset is accepted. id, label, attack_cat and additional source columns are preserved in the raw upload; label/category are never features or findings.
- UNSW streaming profiling validates finite nonnegative numeric features, reports missing/malformed values, profiles proto/service/state and numeric features, and keeps uploaded ground truth separate. Invalid labels are reported rather than inferred or silently accepted. Label/category inconsistencies are quality issues.
- No trusted model bundle is present in the accessible project copies. engine=profile and inference.available=false for UNSW. Label counts are source data, not predictions or evaluation. FortiGate remains engine=rules.
- Summary gains source_type, capabilities, inference and labels. UNSW adds protocol_counts/state_counts/numeric_stats, uses no fake time/IP/ports and denied_events=null when unsupported. Existing FortiGate values/types remain unchanged. Clients use capabilities to select panels.
- GET /api/analyses/{id}/records?offset=0&limit=50 supplies paginated UNSW flow profiles (not detector findings), with feature_values and a separate ground_truth object. FortiGate clients keep using findings; records capability is false there. Ownership/expiry/read leases apply equally to records. No new global evaluation endpoint without actual inference results.
- File/row/body deadline/capacity/session/expiry rules are unchanged.

Implementation sequence: write source-specific API/parser/label-isolation tests and watch failure; implement streaming adapter/profiler and source dispatch; run all old tests plus new ones; capture real synthetic examples; update contract and Claude handoff. Smoke-test both sources over actual HTTP. Claude alone updates web/; do not edit its local working tree.
