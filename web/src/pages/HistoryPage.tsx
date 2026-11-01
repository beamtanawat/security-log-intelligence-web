import { useEffect, useState } from "react";
import { api, describeError } from "../api/client";
import type { WorkspaceList } from "../api/types";
import { AccountBar } from "../components/AccountBar";
import { SOURCE_LABEL } from "../lib/capabilities";
import { formatCount, formatUtc } from "../lib/format";

export const HISTORY_PAGE_SIZE = 20;
export const WORKSPACE_MAX_SAVED = 20;

/** Retention and privacy facts from the staging workspace contract; shown wherever saved data appears. */
export function WorkspaceNotice() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
      <li>Saved results are derived records, findings and model results, not your original CSV. They can still contain sensitive values.</li>
      <li>
        Each saved analysis expires 7 days after saving and is then hidden. Physical deletion runs while the service is awake, so on a
        sleeping free instance it can be delayed.
      </li>
      <li>Up to {WORKSPACE_MAX_SAVED} saved analyses per account. Staging only: use synthetic or sanitized logs.</li>
    </ul>
  );
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-line-soft">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <a href="#" className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md border border-cyan-glow text-[10px] font-semibold text-cyan-glow">
            SLI
          </span>
          Security Log Intelligence
        </a>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <AccountBar />
        </div>
      </div>
    </header>
  );
}

export function HistoryPage() {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<WorkspaceList | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api.workspace.list(offset, HISTORY_PAGE_SIZE, ctrl.signal).then(setPage, (e) => {
      if (e instanceof DOMException) return;
      setPage(null); // never show stale or placeholder history
      setError(describeError(e));
    });
    return () => ctrl.abort();
  }, [offset, reload]);

  const remove = async (id: string) => {
    setDeleting(id);
    setDeleteError(null);
    try {
      await api.workspace.remove(id);
      setConfirming(null);
      if (page && page.items.length === 1 && offset > 0) setOffset(Math.max(0, offset - HISTORY_PAGE_SIZE));
      else setReload((n) => n + 1);
    } catch (e) {
      setDeleteError(describeError(e).detail);
    } finally {
      setDeleting(null);
    }
  };

  const total = page?.total ?? 0;

  return (
    <>
      <SiteHeader>
        <a className="btn btn-primary" href="#">
          New analysis
        </a>
      </SiteHeader>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Saved history</h1>
            {page && (
              <p className="mt-1 text-sm text-muted">
                {formatCount(total)} of {WORKSPACE_MAX_SAVED} saved
              </p>
            )}
          </div>
        </div>
        <section className="panel p-4" aria-label="About saved history">
          <WorkspaceNotice />
        </section>

        {error && (
          <div role="alert" className="panel border-bad p-4">
            <p className="font-semibold text-bad">{error.title}</p>
            <p className="mt-1">{error.detail}</p>
            <button type="button" className="btn mt-3" onClick={() => setReload((n) => n + 1)}>
              Retry
            </button>
          </div>
        )}
        {!page && !error && <p className="text-muted">Loading saved history…</p>}

        {page && page.items.length === 0 && (
          <div className="panel p-8 text-center">
            <p className="font-semibold">No saved analyses yet</p>
            <p className="mt-1 text-sm text-muted">Run an analysis while signed in, then choose “Save to history” on its dashboard.</p>
            <a className="btn btn-primary mt-4" href="#">
              Start an analysis
            </a>
          </div>
        )}

        {page && page.items.length > 0 && (
          <section className="panel p-4" aria-label="Saved analyses">
            {deleteError && (
              <p role="alert" className="mb-3 text-sm text-bad">
                Delete failed. {deleteError} Nothing was removed.
              </p>
            )}
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Saved analyses table, scrollable">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Source</th>
                    <th>Saved</th>
                    <th>Expires</th>
                    <th className="col-action">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((a) => (
                    <tr key={a.analysis_id}>
                      <td className="mono">
                        <a className="text-cyan-glow hover:underline" href={`#/history/${encodeURIComponent(a.analysis_id)}`}>
                          {a.filename}
                        </a>
                      </td>
                      <td>{SOURCE_LABEL[a.source_type] ?? a.source_type}</td>
                      <td>{formatUtc(a.created_at) ?? "—"}</td>
                      <td>{formatUtc(a.expires_at) ?? "—"}</td>
                      <td className="col-action">
                        {confirming === a.analysis_id ? (
                          <span className="flex items-center gap-2">
                            <button type="button" className="btn !min-h-8 !border-bad !px-3 text-bad" disabled={deleting !== null} onClick={() => remove(a.analysis_id)}>
                              {deleting === a.analysis_id ? "Deleting…" : "Confirm delete"}
                            </button>
                            <button type="button" className="btn btn-ghost !min-h-8 !px-3" onClick={() => setConfirming(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="btn !min-h-8 !px-3" onClick={() => setConfirming(a.analysis_id)}>
                            Delete<span className="sr-only"> {a.filename}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p aria-live="polite">
                {offset + 1}–{Math.min(offset + HISTORY_PAGE_SIZE, total)} of {formatCount(total)}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - HISTORY_PAGE_SIZE))}>
                  Previous
                </button>
                <button type="button" className="btn" disabled={offset + HISTORY_PAGE_SIZE >= total} onClick={() => setOffset(offset + HISTORY_PAGE_SIZE)}>
                  Next
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
