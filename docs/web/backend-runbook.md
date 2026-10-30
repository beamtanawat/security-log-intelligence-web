# Backend runbook — Web MVP

This service is separate from the historical localhost/read-only API. Use Python 3.12. This extracted web app installs only FastAPI/Uvicorn/python-multipart, preserving their versions. Research-only scientific dependencies are omitted; requirements-web.txt remains a compatibility entry point.

## Install and run

PowerShell at repository root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt -r requirements-web.txt
.\.venv\Scripts\python.exe -m pip check
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe -m uvicorn web_api.app:create_app --factory --host 127.0.0.1 --port 8000
```

POSIX:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt -r requirements-web.txt
.venv/bin/python -m pip check
PYTHONPATH=src .venv/bin/python -m uvicorn web_api.app:create_app --factory --host 127.0.0.1 --port 8000
```

- Health: http://127.0.0.1:8000/healthz
- Schema: http://127.0.0.1:8000/api/schema
- Endpoint documentation: http://127.0.0.1:8000/api/docs (human contract in api-contract.md is authoritative for response shapes)
- Synthetic sample: http://127.0.0.1:8000/api/sample
- Until Claude supplies and builds `web/`, root returns 503 FRONTEND_NOT_BUILT. That is intentional, not a functioning dashboard.

Claude's dev frontend should run at `127.0.0.1:5173` and proxy `/api` (and `/healthz`) to `http://127.0.0.1:8000` with `changeOrigin:false`. Use relative URLs. Browser sends the frontend Host through the proxy, which passes explicit localhost host checks and same-origin POST checks. No CORS credentials workaround is needed.

## Runtime configuration

- `SLI_DATA_DIR`: dedicated private temporary upload directory. Defaults to `security-log-web` below the OS temporary directory. Do not point at data/raw/, research artifacts, or a directory used by another running instance. Restrict access to the server account. Startup removes previous ID-shaped job directories in this dedicated root.
- `SLI_ALLOWED_HOSTS`: comma-separated explicit hostnames, without scheme or port. Defaults localhost,127.0.0.1; automatically includes `RENDER_EXTERNAL_HOSTNAME` when that provider sets it. Do not use `*`.
- `SLI_SECURE_COOKIES`: true on HTTPS production, false for local HTTP. Render defaults true when external hostname is available. Accepted uploads renew the same ownership cookie for the new job's retention window.
- Run exactly one application worker and one service instance. Process-local session signing and single-worker admission are intentional MVP constraints. Scaling requires a shared job/session store and a redesign of cleanup.
- File 10 MiB, record 50,000, one upload/analysis at once, 8 retained jobs. 429 means current job or storage capacity is full. There is no durable history or user account.
- Upload body must arrive within 30 seconds; 408 frees the slot and removes partial files. Size violations fail with 413 and close multipart spools.
- Retention: no new access after 60 minutes from submission. Cleanup runs on access and every 30 seconds. Already authorized readers finish under a read lease so expiry cannot truncate exports. Downloads have a 30-second response deadline; an active read may delay physical deletion until it finishes (at most that response deadline for downloads). A disconnected/failed stream closes its lease. Restart expires sessions and removes previous temporary jobs.
- Only synthetic examples belong in Git. Upload contents, user filenames and source paths are not logged by analysis code. Disable access logs or apply redaction if an operator adds sensitive query parameters later. Raw upload paths are server-generated.

## Production preparation

`render.yaml` is a blueprint, not proof of deployment. It builds the future web/ via npm ci/run build and serves its dist/ through FastAPI at one origin. Before applying it, Claude must deliver a package lock and a successful build. Select an account/plan, verify Node is available in the build image, and verify the actual HTTPS hostname, secure cookies, forwarded scheme and Origin behavior. Check real upload/sample/export at the live URL. No hosting credentials or a public site were created by this backend work.

## Tests

PowerShell:

```powershell
$env:PYTHONPATH = "src;tests"
.\.venv\Scripts\python.exe -m pytest tests/test_web_uploads.py tests/test_web_jobs.py tests/test_web_summary.py tests/test_web_exports.py tests/test_web_serving.py -q
```

POSIX:

```sh
PYTHONPATH=src:tests .venv/bin/python -m pytest tests/test_web_uploads.py tests/test_web_jobs.py tests/test_web_summary.py tests/test_web_exports.py tests/test_web_serving.py -q
```

See progress.md for observed results and historical full-suite failures. The managed sandbox requires local socket/network permission for Starlette TestClient; without it the event-loop portal can hang before the application lifespan starts. Do not change production code to mask this executor restriction. One upstream Starlette warning deprecates the existing httpx-based TestClient; migration to httpx2 is deferred to keep the historical dependency scope intact.

## Synthetic sample and frontend fixtures

Generate without overwriting existing files:

```sh
PYTHONPATH=src .venv/bin/python scripts/generate_web_sample.py synthetic-example.csv
```

`docs/web/examples/*.json` were captured from an actual TestClient analysis of generated synthetic data. These are integration fixtures, not measured real-world detection performance and not a production fallback. Their temporary IDs and timestamps are examples; a real browser must submit a new job and use its returned ID.

## Explicit source selection

See api-contract.md v1.1 and multi-source-design.md. FortiGate remains the default. For UNSW, upload multipart source_type=unsw_nb15, or request /api/sample?source_type=unsw_nb15 and POST /api/demo?source_type=unsw_nb15. The UNSW engine profiles flows and supplied labels without model inference. Full official benchmark files may exceed the current file/row cap; rejection is explicit. Use the user-selected subset, not silent truncation.
