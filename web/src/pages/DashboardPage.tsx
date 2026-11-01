import { useCallback, useEffect, useState } from "react";
import { api, ApiError, describeError } from "../api/client";
import type { FindingsFilter, Summary } from "../api/types";
import { ApplicationsList, PortsList, RulesBreakdown, SourcesList, TimelinePanel } from "../components/AnalysisCharts";
import { AnalystPanel } from "../components/AnalystPanel";
import { EvaluationPanel } from "../components/EvaluationPanel";
import { FindingDetail } from "../components/FindingDetail";
import { FindingsTable } from "../components/FindingsTable";
import { LabelsPanel } from "../components/LabelsPanel";
import { RecentAnalyses } from "../components/RecentAnalyses";
import { forgetAnalysis, rememberAnalysis } from "../lib/recentAnalyses";
import { RecordsTable } from "../components/RecordsTable";
import { ProtocolStateLists, UnswProfile } from "../components/UnswProfile";
import { anomaliesOf, capabilitiesOf, predictionsOf, sourceOf, SOURCE_LABEL } from "../lib/capabilities";
import { AnomaliesPanel } from "../components/AnomaliesPanel";
import { PredictionsPanel } from "../components/PredictionsPanel";
import { SummaryCards } from "../components/SummaryCards";
import { Tabs, type TabItem } from "../components/Tabs";
import { AccountBar } from "../components/AccountBar";
import { SaveToHistory } from "../components/SaveToHistory";
import { useAuth } from "../lib/auth";
import { formatCount, formatUtc } from "../lib/format";

interface Props {
  analysisId: string;
  onNewUpload: () => void;
  onExpired: () => void;
  onOpenAnalysis: (id: string) => void;
}

export function DashboardPage({ analysisId, onNewUpload, onExpired, onOpenAnalysis }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<FindingsFilter>({ severity: "", rule_id: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const auth = useAuth();
  const signedIn = auth.status === "signed_in";

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    setSummary(null);
    api.summary(analysisId, ctrl.signal).then(
      (s) => {
        setSummary(s);
        rememberAnalysis(s);
      },
      (e) => {
        if (e instanceof DOMException) return;
        if (e?.kind === "expired") return onExpired();
        if (e?.kind === "not_found") forgetAnalysis(analysisId);
        setError(e as ApiError);
      },
    );
    return () => ctrl.abort();
  }, [analysisId, reload, onExpired]);

  const closeDetail = useCallback(() => setOpenId(null), []);

  // The Export menu is a <details>; close it on outside click or Escape like any menu.
  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((menu) => {
        const outside = e instanceof MouseEvent && !menu.contains(e.target as Node);
        const escape = e instanceof KeyboardEvent && e.key === "Escape";
        const picked = e instanceof MouseEvent && (e.target as Element).closest?.(".menu-list a, .menu-list button");
        if (outside || escape || picked) menu.open = false;
      });
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  if (error) {
    const d = describeError(error);
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-10">
        <div role="alert" className="panel border-bad p-5">
          <h1 className="text-xl font-semibold text-bad">{d.title}</h1>
          <p className="mt-2">{d.detail}</p>
          <div className="mt-4 flex gap-3">
            {error.kind === "not_ready" || error.kind === "network" ? (
              <button type="button" className="btn btn-primary" onClick={() => setReload((n) => n + 1)}>
                Try again
              </button>
            ) : null}
            <button type="button" className="btn" onClick={onNewUpload}>
              Back to upload
            </button>
          </div>
        </div>
        <div className="mt-4">
          <RecentAnalyses currentId={analysisId} onOpen={onOpenAnalysis} />
        </div>
      </main>
    );
  }
  if (!summary) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-10">
        <p role="status" className="text-muted">
          Loading analysis…
        </p>
      </main>
    );
  }

  const caps = capabilitiesOf(summary);
  const source = sourceOf(summary);
  const inference = predictionsOf(summary);
  const anomaly = anomaliesOf(summary);
  const anomalyStatus = summary.anomaly_inference;
  const start = formatUtc(summary.time.start);
  const end = formatUtc(summary.time.end);
  const filtered = Boolean(filter.severity || filter.rule_id);

  // A model that is configured but failed is worth one line; a source without a model is not.
  const modelProblem =
    source === "fortigate" && !anomaly && anomalyStatus?.available === false && anomalyStatus.error_code
      ? { label: "Anomaly scores unavailable", code: anomalyStatus.error_code, reason: anomalyStatus.reason }
      : source === "unsw_nb15" && !inference && summary.inference?.available === false && summary.inference.error_code
        ? { label: "Model predictions unavailable", code: summary.inference.error_code, reason: summary.inference.reason }
        : null;

  const overview = (
    <div className="space-y-4">
      {caps.timeline && <TimelinePanel summary={summary} />}
      {source === "unsw_nb15" && <UnswProfile summary={summary} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {caps.findings && <RulesBreakdown summary={summary} />}
        {caps.network_identifiers && <SourcesList summary={summary} />}
        {caps.ports && <PortsList summary={summary} />}
        <ApplicationsList summary={summary} />
        {source === "unsw_nb15" && <ProtocolStateLists summary={summary} />}
      </div>
    </div>
  );

  const tabs: TabItem[] = [];
  if (caps.findings) {
    tabs.push({
      id: "findings",
      label: "Findings",
      count: summary.counts.findings,
      content: (
        <FindingsTable
          analysisId={analysisId}
          severities={summary.severity_counts.map((s) => s.name)}
          ruleIds={summary.rule_counts.map((r) => r.rule_id)}
          filter={filter}
          onFilterChange={setFilter}
          onOpen={setOpenId}
          onExpired={onExpired}
        />
      ),
    });
  }
  if (anomaly) {
    tabs.push({
      id: "anomalies",
      label: "Anomaly scores",
      count: anomaly.scored_records + anomaly.unscored_records,
      content: <AnomaliesPanel analysisId={analysisId} anomaly={anomaly} onExpired={onExpired} />,
    });
  }
  if (inference) {
    tabs.push({
      id: "predictions",
      label: "Model predictions",
      count: inference.scored_records + inference.unscored_records,
      content: <PredictionsPanel analysisId={analysisId} inference={inference} onExpired={onExpired} />,
    });
  }
  if (caps.records) {
    tabs.push({
      id: "records",
      label: "Flow records",
      count: summary.counts.analyzed_records,
      content: <RecordsTable analysisId={analysisId} showLabels={caps.labels} onExpired={onExpired} />,
    });
  }
  tabs.push({ id: "overview", label: "Overview", content: overview });

  const qualityIssues = summary.quality.issues_by_code;

  return (
    <>
      <header className="topbar z-40 lg:sticky lg:top-0 border-b border-line-soft bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-cyan-glow text-xs font-semibold text-cyan-glow">
              SLI
            </span>
            <div className="min-w-0">
              <h1 className="mono truncate !text-base font-medium text-text" title={summary.filename}>
                {summary.filename}
              </h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="text-text">{SOURCE_LABEL[source]}</span>
                {summary.is_demo && <span className="badge text-warn">DEMO · synthetic data</span>}
                {caps.timeline && <span>{start && end ? `${start} → ${end}` : "Event times unknown"}</span>}
                <span>Deleted {formatUtc(summary.expires_at) ?? "within 60 minutes"}</span>
              </p>
            </div>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {caps.findings && (
              <details className="menu">
                <summary className="btn">Export{filtered ? " (filtered)" : ""}</summary>
                <div className="menu-list panel">
                  {signedIn ? (
                    // A signed-in job needs the bearer token, which a plain download link cannot send.
                    (["csv", "json"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => {
                          setExportError(null);
                          api.downloadExport(analysisId, fmt, filter).catch((e) => setExportError(describeError(e).detail));
                        }}
                      >
                        Export {fmt.toUpperCase()}
                      </button>
                    ))
                  ) : (
                    <>
                      <a href={api.exportUrl(analysisId, "csv", filter)} download>
                        Export CSV
                      </a>
                      <a href={api.exportUrl(analysisId, "json", filter)} download>
                        Export JSON
                      </a>
                    </>
                  )}
                  <button type="button" onClick={() => window.print()}>
                    Print / Save as PDF
                  </button>
                </div>
              </details>
            )}
            {!caps.findings && (
              <button type="button" className="btn" onClick={() => window.print()}>
                Print / Save as PDF
              </button>
            )}
            {signedIn && <SaveToHistory analysisId={analysisId} />}
            <button type="button" className="btn btn-primary" onClick={onNewUpload}>
              New upload
            </button>
            <AccountBar />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <SummaryCards summary={summary} />

        {exportError && (
          <p role="alert" className="text-sm text-bad">
            Export failed. {exportError}
          </p>
        )}
        <p role="note" className="text-sm text-muted">
          Findings and model scores are leads to investigate, not confirmed attacks.
          {modelProblem && (
            <span className="ml-1 text-warn">
              {modelProblem.label} <span className="mono">({modelProblem.code})</span>: {modelProblem.reason}
            </span>
          )}
        </p>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <Tabs key={analysisId} label="Analysis views" items={tabs} />
          </div>

          <aside className="rail" aria-label="Analysis context">
            <AnalystPanel summary={summary.summary} />
            {summary.labels !== null && summary.labels !== undefined && <LabelsPanel labels={summary.labels} />}
            <section className="panel p-4" aria-label="Data quality">
              <h2 className="panel-title">Data quality</h2>
              {qualityIssues.length === 0 ? (
                <p className="mt-1 text-sm text-muted">No issues found.</p>
              ) : (
                <>
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      {qualityIssues.map((i) => (
                        <tr key={i.code} className="border-b border-line-soft last:border-0">
                          <td className="mono py-1">{i.code}</td>
                          <td className="py-1 text-right tabular-nums">{formatCount(i.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="panel-sub mt-2">Counts include expected empty fields. Only invalid records failed conversion.</p>
                </>
              )}
            </section>
            {source === "unsw_nb15" && <EvaluationPanel />}
            <RecentAnalyses currentId={analysisId} onOpen={onOpenAnalysis} />
          </aside>
        </div>

        {openId && <FindingDetail analysisId={analysisId} findingId={openId} onClose={closeDetail} onExpired={onExpired} />}
      </main>
    </>
  );
}
