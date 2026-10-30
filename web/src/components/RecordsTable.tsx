import { useEffect, useState } from "react";
import { api, describeError } from "../api/client";
import type { FlowRecord, RecordsPage } from "../api/types";
import { valueToText } from "../lib/format";
import { Drawer } from "./Drawer";
import { LABEL_DISCLAIMER } from "./LabelsPanel";

export const RECORDS_PAGE_SIZE = 25;
const TEXT_FEATURES = new Set(["proto", "service", "state"]);
const KEY_FEATURES = ["proto", "service", "state", "dur", "spkts", "dpkts", "sbytes", "dbytes"];

interface Props {
  analysisId: string;
  showLabels: boolean;
  onExpired: () => void;
}

function cell(v: number | string | null | undefined): string {
  return v === null || v === undefined ? "—" : String(v);
}

function labelText(r: FlowRecord): string {
  const g = r.ground_truth;
  if (!g) return "—";
  if (g.label === null) return g.label_raw ? `invalid (“${g.label_raw}”)` : "—";
  return g.label === 1 ? "ATTACK" : "NORMAL";
}

export function RecordsTable({ analysisId, showLabels, onExpired }: Props) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<RecordsPage | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<FlowRecord | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api.records(analysisId, offset, RECORDS_PAGE_SIZE, ctrl.signal).then(setPage, (e) => {
      if (e instanceof DOMException) return;
      if (e?.kind === "expired") return onExpired();
      setPage(null);
      setError(describeError(e));
    });
    return () => ctrl.abort();
  }, [analysisId, offset, reload, onExpired]);

  const total = page?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + RECORDS_PAGE_SIZE, total);

  return (
    <section className="panel p-4" aria-labelledby="records-h">
      <h2 id="records-h" className="panel-title">
        Flow records
      </h2>
      <p className="mt-1 text-xs text-muted">
        Profiled input rows in file order. These are not detector findings. The row id is a file identifier, not an IP address or time.
      </p>

      {error && (
        <div role="alert" className="mt-3 text-bad">
          <p>
            {error.title}. {error.detail}
          </p>
          <button type="button" className="btn mt-2" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!page && !error && <p className="mt-4 text-muted">Loading records…</p>}

      {page && (
        <>
          {page.items.length === 0 ? (
            <p className="py-8 text-center text-muted">No records.</p>
          ) : (
            <div className="table-scroll mt-3" tabIndex={0} role="region" aria-label="Flow records table, scrollable">
              <table>
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Row id</th>
                    {KEY_FEATURES.map((f) => (
                      <th key={f} className={TEXT_FEATURES.has(f) ? "" : "text-right"}>
                        {f}
                      </th>
                    ))}
                    {showLabels && <th className="border-l border-line">label (file)</th>}
                    {showLabels && <th>attack_cat (file)</th>}
                    <th>Issues</th>
                    <th className="col-action">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((r) => (
                    <tr key={r.source_record_number}>
                      <td className="mono">#{r.source_record_number}</td>
                      <td className="mono">{r.source_id ?? "—"}</td>
                      {KEY_FEATURES.map((f) => (
                        <td key={f} className={`mono ${TEXT_FEATURES.has(f) ? "" : "text-right tabular-nums"}`}>
                          {cell(r.feature_values[f])}
                        </td>
                      ))}
                      {showLabels && <td className="mono border-l border-line">{labelText(r)}</td>}
                      {showLabels && <td className="mono">{r.ground_truth?.attack_cat ?? "—"}</td>}
                      <td className={r.normalization_issues.length ? "text-warn" : "text-muted"}>{r.normalization_issues.length}</td>
                      <td className="no-print col-action">
                        <button type="button" className="btn !min-h-8 !px-3" onClick={() => setOpen(r)}>
                          All features<span className="sr-only"> for record {r.source_record_number}</span>
                        </button>
                      </td>
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
                onClick={() => setOffset(Math.max(0, offset - RECORDS_PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn"
                disabled={offset + RECORDS_PAGE_SIZE >= total}
                onClick={() => setOffset(offset + RECORDS_PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {open && (
        <Drawer title={`Flow record #${open.source_record_number}`} onClose={() => setOpen(null)}>
          <div className="mt-4 space-y-5">
            <section>
              <h3 className="panel-title">Feature values</h3>
              <dl className="mono mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {Object.entries(open.feature_values).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd>{v === null ? "missing" : valueToText(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {showLabels && (
              <section>
                <h3 className="panel-title">Uploaded annotation (not a prediction)</h3>
                <p className="mt-1 text-xs text-muted">{LABEL_DISCLAIMER}</p>
                {open.ground_truth ? (
                  <dl className="mono mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="text-muted">label</dt>
                    <dd>{labelText(open)}</dd>
                    <dt className="text-muted">label_raw</dt>
                    <dd>{open.ground_truth.label_raw || "—"}</dd>
                    <dt className="text-muted">attack_cat</dt>
                    <dd>{open.ground_truth.attack_cat ?? "—"}</dd>
                  </dl>
                ) : (
                  <p className="mt-1 text-sm text-muted">No annotation on this row.</p>
                )}
              </section>
            )}
            <section>
              <h3 className="panel-title">Normalization issues</h3>
              {open.normalization_issues.length === 0 ? (
                <p className="mt-1 text-sm text-muted">None recorded for this record.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {open.normalization_issues.map((iss, i) => (
                    <li key={i} className="rounded-lg border border-line p-3">
                      <p className="mono">
                        {iss.issue_code} · {iss.status} · {iss.source_field ?? "no field"}
                      </p>
                      <p className="mt-1">{iss.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Drawer>
      )}
    </section>
  );
}
