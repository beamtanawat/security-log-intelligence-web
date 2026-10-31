import { useEffect, useState } from "react";
import { api, describeError } from "../api/client";
import type { FindingsFilter, FindingsPage, Severity } from "../api/types";
import { SEVERITY_GLYPH, SEVERITY_SHORT, TIME_NOTE, timeOrUnknown } from "../lib/format";

export const PAGE_SIZE = 25;

interface Props {
  analysisId: string;
  severities: Severity[];
  ruleIds: string[];
  filter: FindingsFilter;
  onFilterChange: (f: FindingsFilter) => void;
  onOpen: (findingId: string) => void;
  onExpired: () => void;
}

export function FindingsTable({ analysisId, severities, ruleIds, filter, onFilterChange, onOpen, onExpired }: Props) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<FindingsPage | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api.findings(analysisId, filter, offset, PAGE_SIZE, ctrl.signal).then(setPage, (e) => {
      if (e instanceof DOMException) return;
      if (e?.kind === "expired") return onExpired();
      setPage(null);
      setError(describeError(e));
    });
    return () => ctrl.abort();
  }, [analysisId, filter, offset, reload, onExpired]);

  const change = (patch: Partial<FindingsFilter>) => {
    setOffset(0); // a new filter always starts from the first page
    onFilterChange({ ...filter, ...patch });
  };

  const total = page?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + PAGE_SIZE, total);

  return (
    <section className="panel p-4" aria-labelledby="findings-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="findings-h" className="panel-title">
            Findings
          </h2>
          <p className="panel-sub">Rule matches in file order. Open one to see its evidence.</p>
        </div>
        <div className="no-print flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mr-2 text-muted">Severity</span>
            <select className="field" value={filter.severity} onChange={(e) => change({ severity: e.target.value })}>
              <option value="">All</option>
              {severities.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_SHORT[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mr-2 text-muted">Rule</span>
            <select className="field" value={filter.rule_id} onChange={(e) => change({ rule_id: e.target.value })}>
              <option value="">All</option>
              {ruleIds.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/^fortigate\./, "")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

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
      {!page && !error && <p className="mt-4 text-muted">Loading findings…</p>}

      {page && (
        <>
          {page.items.length === 0 ? (
            <p className="py-8 text-center text-muted">
              {filter.severity || filter.rule_id
                ? "No findings match these filters."
                : "No rule findings. That alone does not mean the traffic is safe."}
            </p>
          ) : (
            <div className="table-scroll mt-3" tabIndex={0} role="region" aria-label="Findings table, scrollable">
              <table>
                <thead>
                  <tr>
                    <th>Record</th>
                    <th title={TIME_NOTE}>Time (UTC)</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Rule</th>
                    <th>Severity</th>
                    <th className="col-action">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((f) => (
                    <tr key={f.finding_id}>
                      <td className="mono">#{f.source_record_number}</td>
                      <td>{timeOrUnknown(f.event_time)}</td>
                      <td className="mono">{f.source_identifier ?? "—"}</td>
                      <td className="mono">
                        {f.destination_identifier ?? "—"}
                        {f.destination_port !== null ? `:${f.destination_port}` : ""}
                      </td>
                      <td className="mono" title={f.rule_id}>
                        {f.rule_id.replace(/^fortigate\./, "")}
                      </td>
                      <td>
                        <span className="badge text-muted" title={f.severity}>
                          <span aria-hidden="true">{SEVERITY_GLYPH[f.severity]}</span>
                          {SEVERITY_SHORT[f.severity] ?? f.severity}
                        </span>
                      </td>
                      <td className="no-print col-action">
                        <button type="button" className="btn !min-h-8 !px-3" onClick={() => onOpen(f.finding_id)}>
                          Details<span className="sr-only"> for record {f.source_record_number}, {f.rule_id}</span>
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
              <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </button>
              <button type="button" className="btn" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </button>
            </div>
          </div>
          <p className="panel-sub mt-2">Times assume Unix epoch seconds and are not verified.</p>
        </>
      )}
    </section>
  );
}
