# Portfolio evolution implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` for sequential work, or an explicitly authorized subagent workflow. Track completion with checkboxes and test observable behavior.

**Goal:** Evolve the existing synthetic/sanitized-data portfolio into a usable and explainable log-analysis application without losing the working demo.

**Architecture:** Preserve the existing React + FastAPI analysis contract while incrementally introducing authenticated, owner-scoped persistence and background jobs. Keep the deployable demo until the new path is verified. Separate uploaded labels, model outputs, historical metrics, and rule observations; no model training on uploads.

**Tech stack:** React/TypeScript, FastAPI/Python 3.12, PostgreSQL, object storage, a bounded queue and worker. Choose providers and actual deployment after checking current free-tier limits and availability; never assume persistent storage on the Render Free instance.

**Spec:** User-approved five-part roadmap from the conversation: presentation foundations, persistent accounts and history, explainability and investigation workflow, additional explicit log sources and mapping, and operational safety. First target is portfolio use with synthetic or sanitized logs; free services preferred.

## Global constraints

- Never put raw logs, model artifacts, Stage 1.7 metadata, `.env`, credentials or uploads in Git. Synthetic samples only.
- Do not label anomalies or findings as confirmed attacks; do not treat uploaded labels or synthetic demo outcomes as verified ground truth.
- Preserve UNSW feature isolation, artifact hash validation, rate/admission/size limits, error semantics and source ownership.
- Historical results remain immutable; report limitations and do not claim an independent test where none exists.
- No live migration, credential rotation, paid resource, or service cutover until implementation and rollback path are tested. User has authorized work; provider/account access and cost must be established before dependent changes.
- Frontend ownership belongs to Claude unless explicitly coordinated; API changes get contract documentation and examples before frontend handoff.

## Work packages

- [ ] **Foundations:** incorporate latest frontend and demo into the candidate branch; correct README, architecture, screenshots, sample guide and misleading historical evaluation copy without modifying the hashed snapshot. Verify backend and frontend suites.
- [ ] **Investigations:** expose owner-scoped joins between FortiGate record numbers and rule findings; document and test absent/foreign/expired resources and invalid input. Coordinate frontend links, evidence, filters and analyst statuses.
- [ ] **Persistence and identity design:** define tenancy, authentication/session lifecycle, owner enforcement, data minimization, retention/deletion, schema migration, secret storage and recovery. Verify free-tier constraints and choose the provider; do not use the existing in-process job store as shared state.
- [ ] **Persistence and identity implementation:** provision test-only services, implement auth and per-user analysis history with database migrations, private storage and deletion; test access isolation and restart recovery before changing the demo or live site.
- [ ] **Queue and workers:** durable admission, retries/idempotency, cancellation/expiry, bounded concurrency and cleanup; verify failure/restart/ownership under actual infrastructure.
- [ ] **Data source expansion:** implement one explicit source at a time with schema, parser, evidence-backed rules, examples, clear quality errors and no unsupported model inference. Add safe preview/mapping as a separate contract.
- [ ] **Model assessment:** use appropriately approved, independently scoped evaluation data, track source and split provenance, error rates and false positives; do not reuse the synthetic demo as ground truth.
- [ ] **Operations:** rate limiting, privacy-safe telemetry, CI, backup and retention, deployment staging and rollback. Validate capabilities and rotation path for registry credentials without exposing tokens.
- [ ] **Integration:** run backend/frontend tests plus real browser/API uploads of both sources, verify login ownership/deletion and the actual deployed version, then document known limits.

## Review focus

1. Cross-user access to another analysis, annotation or downloaded object must be rejected.
2. Missing/invalid model assets and invalid log rows must never fabricate scores.
3. Process restart, worker retry or expired jobs must not leave inconsistent durable state.
4. PII, credentials and raw payloads must not leak into Git, frontend screenshots or telemetry.
5. Free hosting expiry, sleep and quota limits must be visible and not silently erase promised history.
