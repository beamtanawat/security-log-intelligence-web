# Web MVP progress — 2026-10-30

## Repository separation
Current repository: beamtanawat/security-log-intelligence-web. This is a standalone rules-only web product; see ../provenance.md for reused modules. The extracted repository was verified independently: 27 tests passed, one upstream TestClient deprecation warning, and pip check found no broken requirements. All 11 reused-core file hashes match provenance-manifest.json. The lean runtime does not require scientific packages. The historical results below describe the upstream working copy, not a claim that this new repository contains the full scientific suite. Frontend is pending.


## Delivered by Codex
- Task 1: completed. Python 3.12.14, original pinned dependencies installed; pip check passes. Parser/normalizer/detector baseline: 68 passed, 11 subtests.
- Task 2: completed. Bounded CSV uploads, asynchronous single-worker jobs, synthetic demo/schema/sample, signed session ownership, capacity limits, expiry and cleanup.
- Task 3: completed. Real record/finding/quality aggregates, honest time interpretation, filtered/paginated findings, source evidence and JSON/CSV exports.
- Backend portion Task 5: production entry point, static-build serving, health endpoint, Render blueprint and local real-HTTP smoke completed. Frontend build, full browser flow and public deployment are pending Claude/provider work.
- Task 4 belongs to Claude Code. No frontend implementation has been written by Codex.
- Optional Task 6 (ML/LLM/globe) is deferred. No chat, model fitting or benchmark TEST rerun.

Historical upstream working branch: codex/web-mvp-backend, source base commit 47d931dd21175146766837773ce5825a5276bdf3. The original repository was not pushed. The user subsequently authorized creating/populating the separate security-log-intelligence-web repository; current extraction results are above.

## Verification evidence
- 27 new web tests passed after review fixes, with one upstream Starlette/httpx TestClient deprecation warning.
- Real Uvicorn HTTP smoke passed: generated sample uploaded, 24 input/analyzed records, 6 denied events, 7 informational findings, detail lookup, JSON/CSV exports, malformed-file failure, foreign-session 404, and shutdown file cleanup.
- Whole suite initially: 429 passed, 20 failed, 1 skipped, 126 subtests. Clean committed HEAD independently reproduced those exact same 20 failures (405 passed, 20 failed, 1 skipped, 126 subtests). They are historical Windows-only publication guards and missing ignored experiment/templates/artifacts; no new analysis code fixes those contracts.
- A subsequent run found one transient new documentation-link failure while this progress file was not yet created. This file supplies that link. Final post-documentation whole-suite run: 432 passed, 20 historical failures, 1 skipped, 126 subtests; the failing-name set exactly matches clean HEAD.
- The entire suite is NOT claimed green. All historical failing test names are listed below.
- Maximum-size throughput and output amplification are not benchmarked. Upload limits are engineering defaults, not speed/accuracy claims.
- TestClient needs local socket/network access in this managed sandbox; restricted execution hangs before application lifespan. This is not an application fix.

## Review and decisions
An independent read-only backend reviewer found three Important lifecycle issues, all addressed with failing regression tests followed by passing runs:
1. Expiry/read race: open findings atomically with authorization and lease the reader; a response closes its lease even on disconnect/header failure.
2. Stalled upload holding global slot: 30-second body deadline, parser spool cleanup and abandoned reservation release.
3. Cookie expiring before a later job: accepted POST renews the same owner token for the new retention window; ordinary GET does not slide job retention.

Rulings made:
- Use this dedicated cloud clone and backend branch for isolation; Claude should use a separate branch/worktree. If Claude runs on Windows, explicitly transfer these unpushed files. Cost: manual synchronization until Git writes are authorized.
- Use direct local progress ledger because remote skill helper shell scripts are not installed here. Cost: manual bookkeeping.
- Preserve both active rules as INFORMATIONAL, rather than inventing severity or attack categories. Cost: dashboard has no genuine high-severity classification today.
- Add python-multipart in requirements-web.txt, preserving historical requirements pins. Cost: one additional web-only dependency to maintain.
- Cap retained analyses globally at 8 plus 256 bounded tombstones; reject new work instead of evicting unexpired evidence. Cost: public unauthenticated capacity can be exhausted until expiry; production accounts/quotas are a later extension.
- Active authorized reads may delay physical deletion until their response finishes; downloads have a 30-second response deadline. No new access after expiry. Cost: brief extra physical retention rather than truncated downloads.
- Leave provider-specific TLS/Origin/build and frontend/browser accessibility/export UX pending until real integration. Cost: deployment readiness is unproven, so no live URL claimed.
- Leave maximum-size performance benchmarking pending. Cost: worst-case latency/storage remains unmeasured.
- Keep current formula/control-character CSV protection and unmodified JSON evidence; no demonstrated spreadsheet bypass. Cost: browser-specific spreadsheet UX still needs end-to-end checks.
- Preserve historical time/scientific semantics and label derived times unverified. Cost: new data is not claimed calibrated for attack classification.

Deferred minor review items:
- Exact /api fall-through was subsequently fixed on codex/backend-readiness with a regression test; hosted main remains at its prior revision until that branch is committed/pushed.
- TrustedHost rejects invalid Host using upstream plain-text HTTP 400; contract documents this exception to JSON application errors.
- Upstream TestClient deprecation warning remains; changing historical httpx tooling is outside this MVP.

## Next handoff
Read claude-code-prompt-th.md. Claude owns web/ only and consumes api-contract.md plus real synthetic examples/. Backend run commands are in backend-runbook.md. Return frontend changes and actual typecheck/test/build results for Codex integration. The user authorized the initial new-repository commit/push; no live deployment or frontend completion is claimed.

## Historical full-suite failures reproduced at clean HEAD

```text
FAILED tests/test_ai_features.py::FeatureBundleIntegrationTests::test_auditor_rejects_tampered_feature_row
FAILED tests/test_ai_features.py::FeatureBundleIntegrationTests::test_builder_and_auditor_publish_and_reconcile_a_complete_bundle
FAILED tests/test_ai_features.py::FeatureBundleIntegrationTests::test_holdout_changes_do_not_alter_reference_fitted_metadata
FAILED tests/test_ai_features.py::FeatureBundleIntegrationTests::test_identical_builds_have_identical_feature_and_metadata_payloads
FAILED tests/test_anomaly.py::PublicationAndValidatorContractTests::test_completed_synthetic_bundle_reconciles_and_replays_through_trusted_manifest
FAILED tests/test_stage_2_1_human_inputs.py::test_all_four_human_input_templates_validate_with_placeholders
FAILED tests/test_stage_2_1_human_inputs.py::test_reviewer_registry_rejects_unknown_role_and_duplicate_bindings
FAILED tests/test_stage_2_1_human_inputs.py::test_external_evidence_registry_rejects_closed_enum_violation
FAILED tests/test_stage_2_1_human_inputs.py::test_no_evidence_declaration_rejects_true_availability
FAILED tests/test_stage_2_1_human_inputs.py::test_custodian_template_contains_no_secret_field_or_private_path
FAILED tests/test_stage_2_1_human_inputs.py::test_custodian_validator_rejects_secret_field
FAILED tests/test_stage_2_5_claims.py::test_claims_contract_contains_required_supported_and_forbidden_language
FAILED tests/test_stage_2_5_package.py::test_registry_binds_frozen_branches_models_metrics_and_governance
FAILED tests/test_stage_2_5_package.py::test_registry_preserves_exact_frozen_results_and_leakage_accounting
FAILED tests/test_stage_2_5_package.py::test_registry_generation_is_deterministic
FAILED tests/test_stage_2_5_package.py::test_changed_handoff_hash_fails_closed
FAILED tests/test_stage_2_5_tables_figures.py::test_builds_exact_final_tables_and_figures
FAILED tests/test_stage_2_5_tables_figures.py::test_tables_preserve_registry_values_and_metric_terminology
FAILED tests/test_stage_2_5_tables_figures.py::test_figures_are_claim_safe_and_confusion_matrices_reconcile
FAILED tests/test_stage_2_5_tables_figures.py::test_generation_is_deterministic
```

## Additional backend readiness work

Local branch codex/backend-readiness adds CI configuration, a reusable smoke CLI, lifecycle cleanup and exact /api routing fixes plus five meaningful additional checks. Current backend suite: 32 passed, one upstream warning. See [readiness report](readiness-report.md) for actual 50,000-record measurements and pending production/browser checks. This work does not change web/ or frontend response shapes and has not been pushed automatically.

## User-approved FortiGate + UNSW-NB15 extension

Current backend branch: codex/multi-source-backend, based on initial main 879df2c. This includes the earlier readiness work. The user approved the existing two-dataset approach; Nginx and other new source types are not in scope.

- API contract v1.1 adds explicit source selection, per-source schema/capabilities, UNSW flow records and separate uploaded label distributions. Old FortiGate uploads/demo/sample remain defaults.
- UNSW uses the upstream 28-column predictive contract, accepts optional label/category columns and standard prepared CSVs, and preserves raw uploads. No label/category/row ID enters feature_values. Missing/invalid values and inconsistent labels/categories are disclosed as quality issues.
- Model files were not present in the accessible project copies. UNSW engine=profile and inference.available=false. No ML fitting, official historical TEST evaluation, risk score or accuracy/F1 is claimed. Uploaded labels are not independently verified truth.
- Tests: 40 passed, one upstream Starlette/httpx warning. Existing 32 readiness/FortiGate tests remain passing. Added eight source/label/structural/expiry/quality regressions; malformed rows and record overflow do not publish partial records.
- Independent read-only review found one Important missing-categorical quality issue; its regression failed first, then the UNKNOWN issue reporting fix passed the suite. Structural failures and records expiry coverage were also added.
- Actual Uvicorn HTTP smoke passed both sources: FortiGate 24 records / 7 informational findings; UNSW synthetic demo 12 records with 8 NORMAL and 4 ATTACK uploaded labels / no model predictions. Uploaded labeled/unlabeled UNSW, foreign-session records denial and shutdown cleanup also passed. Response examples were captured from that synthetic run.
- Existing limits remain: 10 MiB / 50,000 rows. Official full UNSW TRAIN/TEST files exceed the row limit; upload an explicitly chosen subset or receive rejection. No silent splitting/downsampling.
- Frontend Task 4 was reported complete by Claude on its machine, but web/ has not been committed/pushed and is not available in this workspace for independent integration checks. Claude must preserve its work and follow claude-multi-source-followup-th.md. No frontend files edited by Codex.
- Deferred: real model inference/evaluation, more source adapters, geo/globe, risk score, browser-specific UX validation and live hosting. Linux tests and local HTTP passed; Windows/hosted CI and Render proxy behavior require their actual environments.

## Historical Accuracy/F1 requested by user

Added GET /api/evaluation with four historical UNSW model reports, source-report/table hashes and dataset/split provenance. BASE-S2: accuracy83.3564%, F1 86.7510% on 82,332 OFFICIAL_TEST_ALL_ROWS at threshold0.5. Values are imported from upstream aggregate tables and reconciled with confusion matrices; original row predictions/model bundles are not present and no TEST evaluation was rerun. TEST is not newly unseen overall; computed_at is null because original computation time is absent from the tables. This does not evaluate uploaded logs or enable classifier inference. Two focused endpoint/provenance tests pass. Claude follow-up now describes a separate historical evaluation panel.
