import { useEffect, useState } from "react";
import { api, describeError } from "../api/client";
import type { AnomaliesPage, AnomalyScore } from "../api/types";
import type { AvailableAnomalyInference } from "../lib/capabilities";
import { formatCount } from "../lib/format";

export const ANOMALIES_PAGE_SIZE = 25;

// Contract wording; used only if the server omits its own disclaimer.
export const ANOMALY_DISCLAIMER =
  "คะแนนแสดงความผิดปกติเทียบกับข้อมูลอ้างอิงเดิม ไม่ใช่ความน่าจะเป็นหรือการยืนยันการโจมตี ต้องตรวจสอบบริบทเพิ่มเติม";

type Order = "file" | "page_score";

interface Props {
  analysisId: string;
  anomaly: AvailableAnomalyInference;
  onExpired: () => void;
}

/** Scored rows by descending percentile, then raw score; unscored rows last. Only reorders the loaded page. */
export function sortPageByScore(items: AnomalyScore[]): AnomalyScore[] {
  const scored = items.filter((i) => i.status === "scored");
  const unscored = items.filter((i) => i.status !== "scored");
  scored.sort((a, b) => b.reference_percentile! - a.reference_percentile! || b.raw_abnormality! - a.raw_abnormality!);
  return [...scored, ...unscored];
}

export function AnomaliesPanel({ analysisId, anomaly, onExpired }: Props) {
  const [offset, setOffset] = useState(0);
  const [order, setOrder] = useState<Order>("file");
  const [page, setPage] = useState<AnomaliesPage | null>(null);
  const [error, setError] = useState<{ detail: string; code: string | null } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api.anomalies(analysisId, offset, ANOMALIES_PAGE_SIZE, ctrl.signal).then(setPage, (e) => {
      if (e instanceof DOMException) return;
      if (e?.kind === "expired") return onExpired();
      setPage(null); // no stale or substitute scores
      setError({ detail: describeError(e).detail, code: e?.code ?? null });
    });
    return () => ctrl.abort();
  }, [analysisId, offset, reload, onExpired]);

  const total = page?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + ANOMALIES_PAGE_SIZE, total);
  const model = anomaly.model;
  const rows = page ? (order === "page_score" ? sortPageByScore(page.items) : page.items) : [];

  return (
    <section className="panel p-4" aria-labelledby="anomalies-h">
      <h2 id="anomalies-h" className="panel-title">
        Anomaly scores ({model.family === "ISOLATION_FOREST" ? "Isolation Forest" : model.family})
      </h2>
      <p role="note" className="mt-1 text-xs text-warn">
        {anomaly.disclaimer || ANOMALY_DISCLAIMER}
      </p>
      <p className="mt-1 text-xs text-muted">
        Separate from rule findings. No threshold, severity or attack label is applied. Higher means more unusual than the reference data.
      </p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
        <dt className="text-muted">Model</dt>
        <dd>{model.model_id}</dd>
        <dt className="text-muted">Reference</dt>
        <dd>{model.training_dataset}</dd>
        <dt className="text-muted">Trained at</dt>
        <dd>{model.trained_at ?? "not recorded"}</dd>
        <dt className="text-muted">Artifact SHA-256</dt>
        <dd className="mono truncate" title={model.artifact_sha256}>
          {model.artifact_sha256.slice(0, 12)}…
        </dd>
        <dt className="text-muted">Scored</dt>
        <dd className="tabular-nums">{formatCount(anomaly.scored_records)}</dd>
        <dt className="text-muted">Not scored</dt>
        <dd className={`tabular-nums ${anomaly.unscored_records > 0 ? "text-warn" : ""}`}>{formatCount(anomaly.unscored_records)}</dd>
      </dl>

      <fieldset className="no-print mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <legend className="sr-only">Row order</legend>
        <span className="text-muted">Order:</span>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="anomaly-order" checked={order === "file"} onChange={() => setOrder("file")} />
          File order
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="anomaly-order" checked={order === "page_score"} onChange={() => setOrder("page_score")} />
          Highest score on this page
        </label>
      </fieldset>
      {order === "page_score" && (
        <p className="mt-1 text-xs text-muted">Sorted within the loaded page only. This is not a ranking across the whole file.</p>
      )}

      {error && (
        <div role="alert" className="mt-3 text-bad">
          <p>
            Anomaly scores unavailable. {error.detail}
            {error.code ? <span className="mono"> ({error.code})</span> : null} No scores are shown.
          </p>
          <button type="button" className="btn mt-2" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!page && !error && <p className="mt-4 text-muted">Loading anomaly scores…</p>}

      {page && (
        <>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-muted">No rows.</p>
          ) : (
            <div className="table-scroll mt-3" tabIndex={0} role="region" aria-label="Anomaly scores table, scrollable">
              <table>
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Status</th>
                    <th className="text-right">Reference percentile</th>
                    <th className="w-32">
                      <span className="sr-only">Percentile bar</span>
                    </th>
                    <th className="text-right">Raw abnormality</th>
                    <th>Reason not scored</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.source_record_number}>
                      <td className="mono">#{r.source_record_number}</td>
                      <td className={r.status === "scored" ? "" : "text-warn"}>{r.status === "scored" ? "scored" : "not scored"}</td>
                      <td className="mono text-right tabular-nums">{r.reference_percentile === null ? "—" : r.reference_percentile.toFixed(1)}</td>
                      <td aria-hidden="true">
                        {r.reference_percentile !== null && (
                          <div className="h-1.5 w-28 rounded-full bg-ink-700">
                            <div className="bar-fill h-1.5 rounded-full bg-cyan-glow" style={{ width: `${r.reference_percentile}%` }} />
                          </div>
                        )}
                      </td>
                      <td className="mono text-right tabular-nums">{r.raw_abnormality === null ? "—" : r.raw_abnormality.toFixed(4)}</td>
                      <td className="mono">{r.error_code ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p aria-live="polite">
              {first}–{last} of {total.toLocaleString("en-US")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - ANOMALIES_PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn"
                disabled={offset + ANOMALIES_PAGE_SIZE >= total}
                onClick={() => setOffset(offset + ANOMALIES_PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      <p className="panel-sub mt-2">
        Record numbers are CSV data rows in this analysis and match the record numbers on rule findings. A row may have several findings or none.
      </p>
    </section>
  );
}
