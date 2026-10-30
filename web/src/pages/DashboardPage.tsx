import { useCallback, useEffect, useState } from "react";
import { api, ApiError, describeError } from "../api/client";
import type { FindingsFilter, Schema, Summary } from "../api/types";
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
import { capabilitiesOf, predictionsOf, sourceOf, SOURCE_LABEL } from "../lib/capabilities";
import { PredictionsPanel } from "../components/PredictionsPanel";
import { SummaryCards } from "../components/SummaryCards";
import { formatUtc, TIME_NOTE } from "../lib/format";

interface Props {
  analysisId: string;
  onNewUpload: () => void;
  onExpired: () => void;
  onOpenAnalysis: (id: string) => void;
}

export function DashboardPage({ analysisId, onNewUpload, onExpired, onOpenAnalysis }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chatAvailable, setChatAvailable] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<FindingsFilter>({ severity: "", rule_id: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

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
    api.schema(ctrl.signal).then((s: Schema) => setChatAvailable(s.chat_available), () => undefined);
    return () => ctrl.abort();
  }, [analysisId, reload, onExpired]);

  const closeDetail = useCallback(() => setOpenId(null), []);

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
  const start = formatUtc(summary.time.start);
  const end = formatUtc(summary.time.end);
  const exportLink = (fmt: "json" | "csv") => (
    <a className="btn" href={api.exportUrl(analysisId, fmt, filter)} download>
      Export {fmt.toUpperCase()}
    </a>
  );

  const qualityNotes = (
    <section className="panel p-4" aria-label="Quality notes">
      <h2 className="panel-title">Normalization notes</h2>
      {summary.quality.issues_by_code.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No normalization issues recorded.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {summary.quality.issues_by_code.map((i) => (
              <tr key={i.code} className="border-b border-line-soft last:border-0">
                <td className="mono py-1">{i.code}</td>
                <td className="py-1 text-right tabular-nums">{i.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="panel-sub mt-2">Includes expected missing values. Only invalid records indicate failed conversions.</p>
    </section>
  );

  return (
    <>
      <header className="topbar z-40 lg:sticky lg:top-0 border-b border-line-soft bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-cyan-glow text-xs font-semibold text-cyan-glow">
              SLI
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted">Security Log Intelligence</p>
              <h1 className="mono truncate !text-base font-medium text-text" title={summary.filename}>
                {summary.filename}
              </h1>
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            {caps.findings && exportLink("json")}
            {caps.findings && exportLink("csv")}
            <button type="button" className="btn" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
            <button type="button" className="btn btn-primary" onClick={onNewUpload}>
              New upload
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-2.5 text-xs text-muted">
          <span className="badge text-text">{SOURCE_LABEL[source]}</span>
          <span className="badge text-cyan-glow">engine: {summary.engine}</span>
          {summary.is_demo && <span className="badge text-warn">DEMO · synthetic data</span>}
          <span>
            Data period:{" "}
            <span className="text-text">
              {caps.timeline ? (start && end ? `${start} → ${end}` : "unknown (no usable event times)") : "not available for this source"}
            </span>
          </span>
          <span>
            Analyzed: <span className="text-text">{formatUtc(summary.created_at) ?? "—"}</span>
          </span>
          <span>
            Expires: <span className="text-text">{formatUtc(summary.expires_at) ?? "—"}</span>
          </span>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <SummaryCards summary={summary} />

        <div className="space-y-1 text-xs text-muted">
          {!inference && summary.inference?.available === false && summary.inference.error_code && (
            <p role="note">
              <span className="font-semibold text-warn">Model predictions unavailable</span>{" "}
              <span className="mono">({summary.inference.error_code})</span>. {summary.inference.reason}
            </p>
          )}
          {!inference && (
            <p role="note">
              <span className="font-semibold text-warn">No AI model predictions.</span>{" "}
              {source === "unsw_nb15"
                ? "This analysis is a statistical profile (engine: profile). No prediction, accuracy, F1, risk score or attack probability is computed for uploaded files."
                : "Results come from transparent rules (engine: rules). No prediction, accuracy, F1, risk score or attack probability is computed for uploaded files."}
            </p>
          )}
          {caps.findings ? (
            <p>
              {caps.timeline ? `${TIME_NOTE} ` : ""}Exports use the same filters as the findings table
              {filter.severity || filter.rule_id ? " (currently filtered)." : " (currently none)."} Findings are rule matches for review;
              they are not confirmed attacks.
            </p>
          ) : (
            <p>
              Descriptive profile of the uploaded rows. No detector findings, timeline or network identifiers exist for this source, so those
              panels are hidden. Finding export is not offered because there are no findings.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            {caps.findings && (
              <FindingsTable
                analysisId={analysisId}
                severities={summary.severity_counts.map((s) => s.name)}
                ruleIds={summary.rule_counts.map((r) => r.rule_id)}
                filter={filter}
                onFilterChange={setFilter}
                onOpen={setOpenId}
                onExpired={onExpired}
              />
            )}
            {inference && <PredictionsPanel analysisId={analysisId} inference={inference} onExpired={onExpired} />}
            {caps.records && <RecordsTable analysisId={analysisId} showLabels={caps.labels} onExpired={onExpired} />}
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

          <aside className="rail" aria-label="Analysis context">
            <RecentAnalyses currentId={analysisId} onOpen={onOpenAnalysis} />
            <AnalystPanel
              summary={summary.summary}
              chatAvailable={chatAvailable}
              onOpenFinding={caps.findings ? setOpenId : null}
              label={summary.engine === "profile" ? "Profile summary" : "Rule-based summary"}
            />
            {summary.labels !== null && summary.labels !== undefined && <LabelsPanel labels={summary.labels} />}
            {qualityNotes}
            <EvaluationPanel />
          </aside>
        </div>

        {openId && <FindingDetail analysisId={analysisId} findingId={openId} onClose={closeDetail} onExpired={onExpired} />}
      </main>
    </>
  );
}
