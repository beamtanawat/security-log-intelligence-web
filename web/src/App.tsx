import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { setAuthHooks } from "./api/client";
import { UploadPage } from "./pages/UploadPage";
import { expireSession, getAccessToken, identityKey, initAuth, useAuth } from "./lib/auth";
import { forgetAnalysis } from "./lib/recentAnalyses";

// Recharts is only needed on the dashboard; keep it out of the upload page's initial bundle.
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const SavedAnalysisPage = lazy(() => import("./pages/SavedAnalysisPage").then((m) => ({ default: m.SavedAnalysisPage })));

// Every API request carries the bearer token while signed in; a rejected token ends the local session.
setAuthHooks({ getToken: getAccessToken, onTokenRejected: () => void expireSession() });
initAuth();

type Route = { page: "upload" } | { page: "analysis"; id: string } | { page: "history" } | { page: "saved"; id: string };

// Minimal hash routing: #/analysis/<id>, #/history, #/history/<id>; anything else shows upload.
function parseHash(): Route {
  const h = window.location.hash;
  const analysis = /^#\/analysis\/([^/?#]+)/.exec(h);
  if (analysis) return { page: "analysis", id: decodeURIComponent(analysis[1]) };
  const saved = /^#\/history\/([^/?#]+)/.exec(h);
  if (saved) return { page: "saved", id: decodeURIComponent(saved[1]) };
  if (/^#\/history\/?$/.test(h)) return { page: "history" };
  return { page: "upload" };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [notice, setNotice] = useState<string | null>(null);
  const auth = useAuth();
  const settledIdentity = useRef<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Temporary analyses belong to the identity that created them, and history needs an account.
  // When the identity changes (sign in, sign out, session expiry), leave pages it can no longer read.
  useEffect(() => {
    if (auth.status === "loading") return;
    const now = identityKey(auth);
    const before = settledIdentity.current;
    settledIdentity.current = now;
    if (before === null || before === now) return;
    if (route.page === "upload") {
      if (auth.status === "signed_out" && auth.reason === "expired") setNotice("Your session ended. Sign in again to use your history.");
      return;
    }
    setNotice(
      auth.status === "signed_in"
        ? "Signed in. Analyses started before signing in stay with the anonymous session."
        : auth.status === "signed_out" && auth.reason === "expired"
          ? "Your session ended. Sign in again to use your history."
          : "Signed out. Analyses from your account are hidden until you sign in again.",
    );
    window.location.hash = "";
    // route is read but not a dependency: only identity changes should trigger this.
  }, [auth]);

  // History needs an account: opening it while signed out (or without auth configured) returns to upload.
  useEffect(() => {
    if (auth.status === "loading" || auth.status === "signed_in") return;
    if (route.page !== "history" && route.page !== "saved") return;
    setNotice(auth.status === "unconfigured" ? "Saved history is not available on this site." : "Sign in to see your saved history.");
    window.location.hash = "";
  }, [route, auth.status]);

  const toUpload = useCallback(() => {
    setNotice(null);
    window.location.hash = "";
    setRoute({ page: "upload" });
  }, []);

  const onExpired = useCallback(() => {
    const r = parseHash();
    if (r.page === "analysis") forgetAnalysis(r.id);
    setNotice("That analysis expired or is no longer available. Results are kept for at most 60 minutes. Upload the file again.");
    window.location.hash = "";
    setRoute({ page: "upload" });
  }, []);

  const onCompleted = useCallback((id: string) => {
    setNotice(null);
    window.location.hash = `#/analysis/${encodeURIComponent(id)}`;
    setRoute({ page: "analysis", id });
  }, []);

  const fallback = (
    <p role="status" className="px-4 py-10 text-center text-muted">
      Loading…
    </p>
  );

  return (
    <>
      <a
        href="#main"
        className="skip-link no-print"
        onClick={(e) => {
          e.preventDefault(); // a real #main hash would be read as a route change
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <Suspense fallback={fallback}>
        {route.page === "analysis" ? (
          <DashboardPage key={route.id} analysisId={route.id} onNewUpload={toUpload} onExpired={onExpired} onOpenAnalysis={onCompleted} />
        ) : route.page === "history" && auth.status === "signed_in" ? (
          <HistoryPage />
        ) : route.page === "saved" && auth.status === "signed_in" ? (
          <SavedAnalysisPage key={route.id} analysisId={route.id} />
        ) : route.page === "history" || route.page === "saved" ? (
          fallback
        ) : (
          <UploadPage onCompleted={onCompleted} notice={notice} />
        )}
      </Suspense>
    </>
  );
}
