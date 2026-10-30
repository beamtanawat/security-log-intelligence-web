import { useCallback, useEffect, useState } from "react";
import { api, ApiError, describeError } from "../api/client";
import type { FindingsFilter, Schema, Summary } from "../api/types";
import { AnalysisCharts, PortsList } from "../components/AnalysisCharts";
import { AnalystPanel } from "../components/AnalystPanel";
import { EvaluationPanel } from "../components/EvaluationPanel";
import { FindingDetail } from "../components/FindingDetail";
import { FindingsTable } from "../components/FindingsTable";
import { LabelsPanel } from "../components/LabelsPanel";
import { RecordsTable } from "../components/RecordsTable";
import { UnswProfile } from "../components/UnswProfile";
import { capabilitiesOf, sourceOf, SOURCE_LABEL } from "../lib/capabilities";
import { SummaryCards } from "../components/SummaryCards";
import { formatUtc, TIME_NOTE } from "../lib/format";

interface Props {
  analysisId: string;
  onNewUpload: () => void;
  onExpired: () => void;
}

export function DashboardPage({ analysisId, onNewUpload, onExpired }: Props) {
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
    api.summary(analysisId, ctrl.signal).then(setSummary, (e) => {
      if (e instanceof DOMException) return;
      if (e?.kind === "expired") return onExpired();
      setError(e as ApiError);
    });
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
  const start = formatUtc(summary.time.start);
  const end = formatUtc(summary.time.end);
  const exportLink = (fmt: "json" | "csv") => (
    <a className="btn" href={api.exportUrl(analysisId, fmt, filter)} download>
      Export {fmt.toUpperCase()}
    </a>
  );

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-[1600px] space-y-4 px-3 py-4 sm:px-4">
      <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-glow text-sm font-extrabold text-[#04222b]">
            SLI
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">Security Log Intelligence</p>
            <p className="truncate text-xs text-muted" title={summary.filename}>
              <span className="mono">{summary.filename}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="badge text-text">{SOURCE_LABEL[source]}</span>
          <span className="badge text-cyan-glow">engine: {summary.engine}</span>
          {summary.is_demo && <span className="badge text-warn">DEMO · synthetic data</span>}
          {caps.timeline ? (
            <span>Data period: {start && end ? `${start} → ${end}` : "unknown (no usable event times)"}</span>
          ) : (
            <span>Data period: not available for this source</span>
          )}
          <span>Analyzed: {formatUtc(summary.created_at) ?? "—"}</span>
          <span>Expires: {formatUtc(summary.expires_at) ?? "—"}</span>
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
      </header>

      {caps.findings ? (
        <p className="text-xs text-muted">
          {caps.timeline ? `${TIME_NOTE} ` : ""}Exports use the same filters as the findings table
          {filter.severity || filter.rule_id ? " (currently filtered)." : " (currently none)."} Findings are rule matches for review; they
          are not confirmed attacks.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Descriptive profile of the uploaded rows. No detector findings, timeline or network identifiers exist for this source, so those
          panels are hidden. Finding export is not offered because there are no findings.
        </p>
      )}

      {!caps.model_inference && (
        <p role="note" className="panel border-warn px-4 py-3 text-sm">
          <span className="font-semibold text-warn">No AI model predictions.</span>{" "}
          {source === "unsw_nb15"
            ? "This analysis is a statistical profile (engine: profile). No prediction, accuracy, F1, risk score or attack probability is computed for uploaded files."
            : "Results come from transparent rules (engine: rules). No prediction, accuracy, F1, risk score or attack probability is computed for uploaded files."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SummaryCards summary={summary} />
          {caps.ports && <PortsList summary={summary} />}
        </div>

        <div className="min-w-0 space-y-4">
          <AnalysisCharts summary={summary} />
          {source === "unsw_nb15" && <UnswProfile summary={summary} />}
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
          {caps.records && <RecordsTable analysisId={analysisId} showLabels={caps.labels} onExpired={onExpired} />}
        </div>

        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          <AnalystPanel
            summary={summary.summary}
            chatAvailable={chatAvailable}
            onOpenFinding={caps.findings ? setOpenId : null}
            label={summary.engine === "profile" ? "Profile summary" : "Rule-based summary"}
          />
          {summary.labels !== null && summary.labels !== undefined && <LabelsPanel labels={summary.labels} />}
          <EvaluationPanel />
          <section className="panel p-4" aria-label="Quality notes">
            <h2 className="panel-title">Normalization notes</h2>
            {summary.quality.issues_by_code.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No normalization issues recorded.</p>
            ) : (
              <ul className="mono mt-2 space-y-1">
                {summary.quality.issues_by_code.map((i) => (
                  <li key={i.code}>
                    {i.code}: {i.count}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">Issues include expected missing values; only “invalid records” indicate failed conversions.</p>
          </section>
        </div>
      </div>

      {openId && <FindingDetail analysisId={analysisId} findingId={openId} onClose={closeDetail} onExpired={onExpired} />}
    </main>
  );
}
