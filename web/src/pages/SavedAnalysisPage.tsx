import { useEffect, useState } from "react";
import { api, describeError } from "../api/client";
import type {
  AnomalyScore,
  Finding,
  FlowRecord,
  Prediction,
  QualityIssueItem,
  WorkspaceDetail,
  WorkspaceItemKind,
} from "../api/types";
import { ANOMALY_DISCLAIMER } from "../components/AnomaliesPanel";
import { LABEL_DISCLAIMER } from "../components/LabelsPanel";
import { PREDICTION_DISCLAIMER } from "../components/PredictionsPanel";
import { SummaryCards } from "../components/SummaryCards";
import { Tabs, type TabItem } from "../components/Tabs";
import { WorkspaceItemsTable, type Column } from "../components/WorkspaceItemsTable";
import { anomaliesOf, capabilitiesOf, predictionsOf, SOURCE_LABEL } from "../lib/capabilities";
import { formatUtc, SEVERITY_GLYPH, SEVERITY_SHORT, timeOrUnknown } from "../lib/format";
import { SiteHeader, WorkspaceNotice } from "./HistoryPage";

const findingColumns: Column<Finding>[] = [
  { label: "Time (UTC)", cell: (f) => timeOrUnknown(f.event_time) },
  { label: "Rule", mono: true, cell: (f) => f.rule_id.replace(/^fortigate\./, "") },
  {
    label: "Severity",
    cell: (f) => (
      <span className="badge text-muted" title={f.severity}>
        <span aria-hidden="true">{SEVERITY_GLYPH[f.severity]}</span>
        {SEVERITY_SHORT[f.severity] ?? f.severity}
      </span>
    ),
  },
  { label: "Source", mono: true, cell: (f) => f.source_identifier ?? "—" },
  { label: "Destination", mono: true, cell: (f) => `${f.destination_identifier ?? "—"}${f.destination_port !== null ? `:${f.destination_port}` : ""}` },
];

const anomalyColumns: Column<AnomalyScore>[] = [
  { label: "Status", cell: (a) => (a.status === "scored" ? "scored" : "not scored") },
  { label: "Reference percentile", right: true, mono: true, cell: (a) => (a.reference_percentile === null ? "—" : a.reference_percentile.toFixed(1)) },
  { label: "Raw abnormality", right: true, mono: true, cell: (a) => (a.raw_abnormality === null ? "—" : a.raw_abnormality.toFixed(4)) },
  { label: "Reason not scored", mono: true, cell: (a) => a.error_code ?? "—" },
];

const predictionColumns: Column<Prediction>[] = [
  { label: "Status", cell: (p) => (p.status === "scored" ? "scored" : "not scored") },
  { label: "Predicted class", mono: true, cell: (p) => p.class_name ?? "—" },
  { label: "Model score (uncalibrated)", right: true, mono: true, cell: (p) => (p.score === null ? "—" : p.score.toFixed(3)) },
  { label: "Reason not scored", mono: true, cell: (p) => p.error_code ?? "—" },
];

const recordColumns = (labels: boolean): Column<FlowRecord>[] => [
  { label: "Row id", mono: true, cell: (r) => r.source_id ?? "—" },
  ...["proto", "service", "state"].map((f) => ({ label: f, mono: true, cell: (r: FlowRecord) => String(r.feature_values[f] ?? "—") })),
  ...(labels
    ? [
        {
          label: "label (file)",
          mono: true,
          cell: (r: FlowRecord) => (r.ground_truth?.label === 1 ? "ATTACK" : r.ground_truth?.label === 0 ? "NORMAL" : "—"),
        },
      ]
    : []),
];

const qualityColumns: Column<QualityIssueItem>[] = [
  { label: "Issues", mono: true, cell: (q) => q.issues.map((i) => `${i.issue_code} (${i.source_field ?? "no field"})`).join(", ") },
  { label: "Status", cell: (q) => [...new Set(q.issues.map((i) => i.status))].join(", ") },
];

interface Props {
  analysisId: string;
}

export function SavedAnalysisPage({ analysisId }: Props) {
  const [data, setData] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState<{ title: string; detail: string; missing: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    setData(null);
    api.workspace.get(analysisId, ctrl.signal).then(setData, (e) => {
      if (e instanceof DOMException) return;
      setError({ ...describeError(e), missing: e?.kind === "not_found" });
    });
    return () => ctrl.abort();
  }, [analysisId, reload]);

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.workspace.remove(analysisId);
      window.location.hash = "#/history";
    } catch (e) {
      setDeleteError(describeError(e).detail);
      setDeleting(false);
    }
  };

  const back = (
    <a className="btn" href="#/history">
      Back to history
    </a>
  );

  if (error) {
    return (
      <>
        <SiteHeader>{back}</SiteHeader>
        <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-10">
          <div role="alert" className="panel border-bad p-5">
            <h1 className="text-xl font-semibold text-bad">{error.missing ? "Saved analysis not found" : error.title}</h1>
            <p className="mt-2">{error.missing ? "It may have expired, been deleted, or belong to another account." : error.detail}</p>
            {!error.missing && (
              <button type="button" className="btn mt-4" onClick={() => setReload((n) => n + 1)}>
                Retry
              </button>
            )}
          </div>
        </main>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <SiteHeader>{back}</SiteHeader>
        <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-10">
          <p role="status" className="text-muted">
            Loading saved analysis…
          </p>
        </main>
      </>
    );
  }

  const summary = data.summary;
  const caps = capabilitiesOf(summary);
  const inference = predictionsOf(summary);
  const anomaly = anomaliesOf(summary);
  const table = <T,>(kind: WorkspaceItemKind, columns: Column<T>[], note?: string) => (
    <WorkspaceItemsTable<T> analysisId={analysisId} kind={kind} columns={columns} note={note} />
  );

  const tabs: TabItem[] = [];
  if (caps.findings) tabs.push({ id: "finding", label: "Findings", count: summary.counts.findings, content: table("finding", findingColumns) });
  if (anomaly) {
    tabs.push({
      id: "anomaly",
      label: "Anomaly scores",
      content: table("anomaly", anomalyColumns, anomaly.disclaimer || ANOMALY_DISCLAIMER),
    });
  }
  if (inference) {
    tabs.push({
      id: "prediction",
      label: "Model predictions",
      content: table("prediction", predictionColumns, inference.disclaimer || PREDICTION_DISCLAIMER),
    });
  }
  if (caps.records) {
    tabs.push({
      id: "record",
      label: "Flow records",
      content: table("record", recordColumns(caps.labels), caps.labels ? LABEL_DISCLAIMER : undefined),
    });
  }
  tabs.push({ id: "quality", label: "Data quality", content: table("quality", qualityColumns) });

  return (
    <>
      <SiteHeader>{back}</SiteHeader>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="mono truncate text-lg font-medium" title={data.filename}>
              {data.filename}
            </h1>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="text-text">{SOURCE_LABEL[data.source_type] ?? data.source_type}</span>
              <span>Saved {formatUtc(data.created_at) ?? "—"}</span>
              <span>Expires {formatUtc(data.expires_at) ?? "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <button type="button" className="btn !border-bad text-bad" disabled={deleting} onClick={remove}>
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirming(true)}>
                Delete saved analysis
              </button>
            )}
          </div>
        </div>
        {deleteError && (
          <p role="alert" className="text-sm text-bad">
            Delete failed. {deleteError} Nothing was removed.
          </p>
        )}

        <SummaryCards summary={summary} />
        <p role="note" className="text-sm text-muted">
          Saved snapshot. Findings and model scores are leads to investigate, not confirmed attacks. Your review status and notes are your
          own annotations; marking an item reviewed does not confirm an attack.
        </p>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <Tabs key={analysisId} label="Saved analysis views" items={tabs} />
          </div>
          <aside className="rail" aria-label="Saved analysis context">
            <section className="panel p-4" aria-labelledby="saved-summary-h">
              <h2 id="saved-summary-h" className="panel-title">
                Summary
              </h2>
              <p className="mt-2 text-sm leading-relaxed">{summary.summary.text}</p>
            </section>
            <section className="panel p-4" aria-label="About saved data">
              <h2 className="panel-title">About saved data</h2>
              <div className="mt-2">
                <WorkspaceNotice />
              </div>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
