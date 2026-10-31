# Frontend handoff

Backend branch: `codex/portfolio-foundations`. Read `api-contract.md` first; preserve user work and coordinate integration.

- FortiGate anomaly row N: GET `/api/analyses/{id}/findings?source_record_number=N` returns same-session findings for the same source row, with existing pagination and filters. Empty results do not establish safety. See `examples/findings-record-1.json`.
- DELETE `/api/analyses/{id}` deletes temporary results owned by the current session. It returns 204, 409 `ANALYSIS_IN_USE`, 410 expired/deleted, 404 foreign/unknown, or 403 rejected origin. Remove recent entry only after 204/410. This does not yet implement persistent account history.
- Add appropriate loading/empty/error states, protect UNSW from FortiGate-only UI and preserve disclaimers. Run typecheck, frontend tests and build, then test with the actual backend before integration.
