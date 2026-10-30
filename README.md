# Security Log Intelligence Web

A web application under development for uploading supported FortiGate and UNSW-NB15 CSV logs, reviewing source-observation findings and inspecting their evidence in a dashboard.

**Two-source backend implemented; frontend integration pending.** FortiGate uses deterministic rules; UNSW-NB15 uses descriptive profiling with separately reported uploaded labels. It does not confirm attacks, estimate attack probabilities, perform calibrated ML inference or provide live LLM chat.

## Origin and what is new here

This is a separate web product built on selected analysis modules from [Security Log Intelligence](https://github.com/beamtanawat/security-log-intelligence), an earlier research/learning project by the same developer. The parser, normalization contracts and two informational detection rules are reused, rather than represented as entirely new work. This repository develops the web-facing upload/job/session API, summaries, exports and the forthcoming React interface. See [provenance](docs/provenance.md) for the source revision and copied-file hashes.

No historical benchmark results establish the accuracy of uploaded-data findings. No raw logs, model bundles or research result packages are included.

## Stack

Python 3.12, FastAPI, Uvicorn, multipart CSV uploads. Planned frontend: React, TypeScript, Vite, Tailwind CSS and Recharts. One Python service will serve the frontend build and API at one origin. Scientific/ML dependencies from the research project are not required for the rules-only web app.

## Local setup

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
PYTHONPATH=src .venv/bin/python -m uvicorn web_api.app:create_app --factory --host 127.0.0.1 --port 8000
```

PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe -m uvicorn web_api.app:create_app --factory --host 127.0.0.1 --port 8000
```

Use `/healthz`, `/api/schema`, `/api/sample` and `/api/docs` for backend inspection. Until the frontend build exists, `/` deliberately returns 503 `FRONTEND_NOT_BUILT`.

## Tests

```sh
.venv/bin/python -m pytest -q
```

Tests use synthetic data, not historical raw logs. The extracted web suite is separate from the upstream scientific test suite. See [progress](docs/web/progress.md) for actual verification and limitations.

## Frontend handoff

Claude Code owns `web/`. Continue the existing UI using [the multi-source follow-up prompt](docs/web/claude-multi-source-followup-th.md), rather than rebuilding Task 4. Start by reading [AGENTS.md](AGENTS.md), the [approved design](docs/superpowers/specs/2026-10-30-security-log-web-design.md), [implementation plan](docs/superpowers/plans/2026-10-30-security-log-web.md), [API contract](docs/web/api-contract.md) and [Claude prompt](docs/web/claude-code-prompt-th.md). Use a separate frontend branch and the real synthetic API examples. No silent fake-data fallback in production.

## Runtime limits and interpretation

- Explicit source selection: FortiGate CSV or UNSW-NB15 prepared CSV (28 predictive columns, optional labels). Limits remain 10 MiB / 50,000 records, 30-second upload deadline; full official UNSW files may exceed these limits.
- One active analysis, eight retained jobs, session-owned results and 60-minute new-access expiry. An active download may defer physical deletion until completion under a bounded response deadline.
- Restart expires temporary jobs/sessions. No accounts or persistent history.
- Both FortiGate active rules are INFORMATIONAL. UNSW reports flow/feature statistics and uploaded labels without detector findings or model inference. A rule match, deny or anomaly is not proof of an attack; absence of a finding does not establish benign activity.
- Timestamps use an explicitly unverified epoch-seconds interpretation. Tokenized identifiers are not geolocated.

See the [backend runbook](docs/web/backend-runbook.md) and [backend readiness report](docs/web/readiness-report.md). `render.yaml` prepares deployment after a frontend package lock/build exists; no live deployment is claimed.
