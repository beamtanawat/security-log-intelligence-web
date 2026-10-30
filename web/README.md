# Frontend (web/)

React 19 + TypeScript + Vite + Tailwind CSS 4 + Recharts. Consumes `docs/web/api-contract.md` through relative `/api` URLs. No fixtures or fallback data ship in `src/`; fixtures under `src/test/` are used only by tests.

```sh
cd web
npm ci
npm run dev        # http://127.0.0.1:5173, proxies /api and /healthz to http://127.0.0.1:8000 (changeOrigin:false)
npm run typecheck
npm test
npm run build      # outputs web/dist/ (served by the backend)
```

Start the backend first (see `docs/web/backend-runbook.md`). Routing is hash based: `#/analysis/<id>` is the dashboard.
