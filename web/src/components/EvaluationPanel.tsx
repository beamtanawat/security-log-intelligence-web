import { useEffect, useId, useState } from "react";
import { api } from "../api/client";
import type { Evaluation } from "../api/types";
import { formatCount, formatUtc } from "../lib/format";

const pct = (ratio: number) => `${(ratio * 100).toFixed(2)}%`;

/** Historical UNSW-NB15 benchmark from the upstream report. Not an evaluation of the current upload. */
export function EvaluationPanel() {
  const selectId = useId();
  const [data, setData] = useState<Evaluation | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [model, setModel] = useState<string>("");

  useEffect(() => {
    const ctrl = new AbortController();
    setFailed(false);
    api.evaluation(ctrl.signal).then(
      (d) => {
        setData(d);
        setModel(d.preferred_model);
      },
      (e) => {
        if (e instanceof DOMException) return;
        setData(null); // no fixture fallback: unavailable means no numbers
        setFailed(true);
      },
    );
    return () => ctrl.abort();
  }, [reload]);

  const selected = data?.models.find((m) => m.model === model) ?? null;

  return (
    <section className="panel p-4" aria-labelledby="eval-h">
      <h2 id="eval-h" className="panel-title">
        ผลประเมินโมเดล — UNSW-NB15 (รายงานเดิม)
      </h2>
      <p className="mt-1 text-xs text-warn">
        ผลจาก benchmark เดิม ไม่ใช่ความแม่นยำของไฟล์ที่อัปโหลด และไม่ใช่ผลของ FortiGate
      </p>

      {failed && (
        <div role="alert" className="mt-3 text-sm">
          <p className="text-bad">Evaluation results are unavailable right now. No scores are shown.</p>
          <button type="button" className="btn mt-2" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!data && !failed && <p className="mt-3 text-sm text-muted">Loading evaluation…</p>}

      {data && (
        <>
          <label htmlFor={selectId} className="mt-3 block text-sm">
            <span className="mr-2 text-muted">Model</span>
            <select id={selectId} className="field" value={model} onChange={(e) => setModel(e.target.value)}>
              {data.models.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.model}
                  {m.model === data.preferred_model ? " (preferred)" : ""}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-center" aria-label={`Scores for ${selected.model}`}>
                {(
                  [
                    ["Accuracy", selected.metrics.accuracy, "text-cyan-glow"],
                    ["F1", selected.metrics.f1, "text-cyan-glow"],
                    ["Precision", selected.metrics.precision, "text-text"],
                    ["Recall", selected.metrics.recall, "text-text"],
                  ] as const
                ).map(([name, v, tone]) => (
                  <div key={name} className="rounded-lg border border-line p-2">
                    <dt className="text-xs text-muted">{name}</dt>
                    <dd className={`text-xl font-bold tabular-nums ${tone}`}>{pct(v)}</dd>
                  </div>
                ))}
              </dl>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Dataset</dt>
                <dd>{data.dataset}</dd>
                <dt className="text-muted">Split</dt>
                <dd className="mono">{data.split}</dd>
                <dt className="text-muted">Rows</dt>
                <dd className="tabular-nums">{formatCount(selected.row_count)}</dd>
                <dt className="text-muted">Threshold</dt>
                <dd className="tabular-nums">{selected.threshold}</dd>
                <dt className="text-muted">Computed</dt>
                <dd>{formatUtc(data.computed_at) ?? "not recorded in the original report"}</dd>
                <dt className="text-muted">Source</dt>
                <dd>
                  <a className="text-cyan-glow underline" href={selected.source_table_url} target="_blank" rel="noopener noreferrer">
                    Source table
                  </a>
                </dd>
              </dl>
              {model === data.preferred_model && <p className="mt-2 text-xs text-muted">Preferred model: {data.preferred_model_basis}</p>}
            </>
          )}

          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-semibold">Limitations</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {!data.test_newly_unseen && <li>The TEST split is not newly unseen: it was used in earlier project stages.</li>}
              {!data.statistical_significance_claim && <li>No statistical significance is claimed for differences between models.</li>}
              {data.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
