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

## Staging sign-in and saved history (optional)

Without configuration the site works anonymously and the account UI is hidden. To enable Supabase Auth for a staging build, copy `.env.example` to `.env.local` (gitignored) and fill in the staging **Project URL** and **publishable key** only. Vite reads them at build time (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Never put a database password, connection string, service-role key or access token in the frontend.

- Email/password sign-in via `@supabase/auth-js`. The session is kept in `sessionStorage` (ends when the tab closes) and refreshed automatically; a token the API rejects ends the local session.
- While signed in, every API request carries `Authorization: Bearer <access token>` (upload/demo, polling, results, export, workspace). Anonymous jobs and signed-in jobs are kept apart in the tab's recent list.
- Routes: `#/history` (saved list) and `#/history/<id>` (saved snapshot with per-item review status and notes).
