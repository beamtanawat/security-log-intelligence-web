import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { UploadPage } from "./pages/UploadPage";

// Recharts is only needed on the dashboard; keep it out of the upload page's initial bundle.
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));

// Minimal hash routing: #/analysis/<id> shows the dashboard, anything else shows upload.
function parseHash(): string | null {
  const m = /^#\/analysis\/([^/?#]+)/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

export function App() {
  const [analysisId, setAnalysisId] = useState<string | null>(parseHash);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setAnalysisId(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const toUpload = useCallback(() => {
    setNotice(null);
    window.location.hash = "";
    setAnalysisId(null);
  }, []);

  const onExpired = useCallback(() => {
    setNotice("That analysis expired or is no longer available. Results are kept for at most 60 minutes. Upload the file again.");
    window.location.hash = "";
    setAnalysisId(null);
  }, []);

  const onCompleted = useCallback((id: string) => {
    setNotice(null);
    window.location.hash = `#/analysis/${encodeURIComponent(id)}`;
    setAnalysisId(id);
  }, []);

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
      {analysisId ? (
        <Suspense
          fallback={
            <p role="status" className="px-4 py-10 text-center text-muted">
              Loading dashboard…
            </p>
          }
        >
          <DashboardPage key={analysisId} analysisId={analysisId} onNewUpload={toUpload} onExpired={onExpired} />
        </Suspense>
      ) : (
        <UploadPage onCompleted={onCompleted} notice={notice} />
      )}
    </>
  );
}
