import { useEffect, useState } from "react";
import { api, describeError } from "../api/client";
import type { Prediction, PredictionsPage } from "../api/types";
import type { AvailableInference } from "../lib/capabilities";
import { formatCount } from "../lib/format";
import { RankedList } from "./RankedList";

export const PREDICTIONS_PAGE_SIZE = 25;

// Contract wording (v1.2 draft); used only if the server omits its own disclaimer.
export const PREDICTION_DISCLAIMER =
  "ผลนี้เป็นการคาดการณ์จากโมเดลที่ฝึกด้วย UNSW-NB15 ไม่ใช่การยืนยันการโจมตี คะแนนไม่ได้รับการปรับเทียบเป็นความน่าจะเป็นจริง และไม่ได้ประเมิน Accuracy/F1 ของไฟล์นี้";

interface Props {
  analysisId: string;
  inference: AvailableInference;
  onExpired: () => void;
}

function scoreText(p: Prediction): string {
  return p.status === "scored" ? p.score.toFixed(3) : "—";
}

export function PredictionsPanel({ analysisId, inference, onExpired }: Props) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<PredictionsPage | null>(null);
  const [error, setError] = useState<{ title: string; detail: string; code: string | null } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api.predictions(analysisId, offset, PREDICTIONS_PAGE_SIZE, ctrl.signal).then(setPage, (e) => {
      if (e instanceof DOMException) return;
      if (e?.kind === "expired") return onExpired();
      setPage(null); // no stale or substitute predictions
      setError({ ...describeError(e), code: e?.code ?? null });
    });
    return () => ctrl.abort();
  }, [analysisId, offset, reload, onExpired]);

  const total = page?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + PREDICTIONS_PAGE_SIZE, total);
  const model = inference.model;
  const counts = inference.prediction_counts.map((c) => ({ name: c.class_name, count: c.count }));

  return (
    <section className="panel p-4" aria-labelledby="predictions-h">
      <h2 id="predictions-h" className="panel-title">
        Model predictions ({model.model_id})
      </h2>
      <p role="note" className="mt-1 text-xs text-warn">
        {inference.disclaimer || PREDICTION_DISCLAIMER}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Model</dt>
          <dd>
            {model.model_id} · {model.family}
          </dd>
          <dt className="text-muted">Trained on</dt>
          <dd>{model.training_dataset}</dd>
          <dt className="text-muted">Trained at</dt>
          <dd>{model.trained_at ?? "not recorded"}</dd>
          <dt className="text-muted">Artifact SHA-256</dt>
          <dd className="mono truncate" title={model.artifact_sha256}>
            {model.artifact_sha256.slice(0, 12)}…
          </dd>
          <dt className="text-muted">Threshold</dt>
          <dd className="tabular-nums">ATTACK when score ≥ {inference.threshold}</dd>
          <dt className="text-muted">Scored</dt>
          <dd className="tabular-nums">{formatCount(inference.scored_records)}</dd>
          <dt className="text-muted">Not scored</dt>
          <dd className={`tabular-nums ${inference.unscored_records > 0 ? "text-warn" : ""}`}>
            {formatCount(inference.unscored_records)}
          </dd>
          <dt className="text-muted">Accuracy / F1</dt>
          <dd>not evaluated for this file</dd>
        </dl>
        <div>
          <h3 className="text-sm font-semibold">Predicted class (scored rows only)</h3>
          <RankedList items={counts} label="Predicted class counts" empty="No rows were scored." />
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 text-bad">
          <p>
            Predictions unavailable. {error.detail}
            {error.code ? <span className="mono"> ({error.code})</span> : null} No predictions are shown.
          </p>
          <button type="button" className="btn mt-2" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!page && !error && <p className="mt-4 text-muted">Loading predictions…</p>}

      {page && (
        <>
          {page.items.length === 0 ? (
            <p className="py-8 text-center text-muted">No predictions.</p>
          ) : (
            <div className="table-scroll mt-3" tabIndex={0} role="region" aria-label="Model predictions table, scrollable">
              <table>
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Status</th>
                    <th>Predicted class</th>
                    <th className="text-right">Model score (uncalibrated)</th>
                    <th>Reason not scored</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((p) => (
                    <tr key={p.source_record_number}>
                      <td className="mono">#{p.source_record_number}</td>
                      <td className={p.status === "scored" ? "" : "text-warn"}>{p.status === "scored" ? "scored" : "not scored"}</td>
                      <td className={`mono ${p.class_name === "ATTACK" ? "text-warn" : ""}`}>{p.class_name ?? "—"}</td>
                      <td className="mono text-right tabular-nums">{scoreText(p)}</td>
                      <td className="mono">{p.error_code ?? "—"}</td>
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
                onClick={() => setOffset(Math.max(0, offset - PREDICTIONS_PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn"
                disabled={offset + PREDICTIONS_PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PREDICTIONS_PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      <p className="panel-sub mt-2">
        Record numbers match the flow records table. Predictions are not uploaded labels and are not confirmed incidents.
      </p>
    </section>
  );
}
