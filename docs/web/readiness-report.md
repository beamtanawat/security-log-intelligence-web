# Backend readiness report

Branch: codex/multi-source-backend (includes the earlier backend-readiness work). This work does not edit web/ or change the frontend response schemas.

## Observed synthetic pipeline measurements

| Records | Input bytes | Findings | Seconds | Pipeline process peak RSS (KiB) | Findings bytes | Issues bytes |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 138432 | 2000 | 0.274 | 13440 | 3789566 | 865893 |
| 50000 | 7078432 | 100000 | 13.146 | 25608 | 189855568 | 43388894 |

The scenario uses unique synthetic sources and sparse fields with both informational rules matching every record. The 50,000-row run produces about 233 MB (decimal) of finding/issue files from about 7.1 MB of input. This illustrates output amplification and the need to budget temporary disk space, not proof that all possible inputs fit that output size. Eight retained jobs of this measured shape would use about 1.9 GB plus input files. Keep one worker and the current admission/retention limits; choose a host with enough temporary disk and verify its actual quota before publishing. Do not infer production speed or whole-service memory from this single cloud pipeline run.

Raw row-level benchmark data was temporary and deleted. Aggregates, scope and measurement caveats are in readiness-benchmark.json. The measurement did not run ML training, benchmark TEST data or real customer logs.

## Implemented and verified locally

- All backend tests: 32 passed, one existing upstream Starlette/httpx deprecation warning.
- A failing regression demonstrated that exceptional lifespan exit skipped job cleanup. A try/finally now closes the store on both normal and exceptional exit.
- Exact /api is reserved as JSON 404 even when a SPA build exists. Unknown /api/... behavior and documented endpoint response shapes are unchanged.
- HTTPS tests verify Render-derived hostname settings, Secure HttpOnly cookie behavior, same-origin accepted POST and scheme-mismatched Origin rejection. They do not prove the provider forwards scheme/Host correctly.
- Disconnect test verifies findings read leases close even when sending response headers fails.
- scripts/smoke_web_backend.py validates demo, supported upload, malformed upload failure, real sample counts, finding details, filtered results, JSON/CSV exports and cross-session denial. It uses only generated data and leaves three ordinary temporary jobs subject to the server retention policy; run only against a user-owned development/deployment service.
- .github/workflows/backend.yml prepares read-only GitHub Actions checks on Linux and Windows Python 3.12. YAML structure has been parsed locally. Hosted CI has not been observed until this branch is pushed and a workflow run is inspected.

Real-socket smoke CLI passed against temporary Uvicorn: 24 synthetic records / 7 findings, malformed-file handling and cross-session denial; shutdown removed temporary jobs. Subsequent two-source smoke and 40-test results are recorded in progress.md. No public deployment, visibility change, commit or push is implied by this readiness work.

## Before integrating Claude's frontend

1. Obtain Claude's web/ changes and exact typecheck/test/build results on its branch. Preserve the API contract and the original repository.
2. Run npm ci and the actual package scripts in web/; inspect actual web/dist files. Do not replace errors with demo fixtures.
3. Run one-origin production serving and a browser flow: sample → dashboard → filters → evidence → export, file upload, invalid file, expiry recovery, new browser session, narrow screen and keyboard navigation.
4. Validate browser cookie/Origin behavior through the actual HTTPS proxy. Set SLI_ALLOWED_HOSTS to explicit hostnames, SLI_SECURE_COOKIES=true and a dedicated SLI_DATA_DIR. Use one worker/instance.
5. Inspect temporary disk quota, retention cleanup and process restart behavior on the chosen host. Do not enable scaling with the current process-local job/session state.
6. Run the smoke CLI against the live user-owned URL and then verify frontend/browser checks. /healthz alone is insufficient; its frontend_ready field reports only build presence.
7. Change repository/site visibility or publish only under the user's deployment instructions.

Smoke CLI after installing requirements-dev.txt:

```sh
.venv/bin/python scripts/smoke_web_backend.py --base-url http://127.0.0.1:8000
```

PowerShell:

```powershell
.\.venv\Scripts\python.exe scripts/smoke_web_backend.py --base-url http://127.0.0.1:8000
```
