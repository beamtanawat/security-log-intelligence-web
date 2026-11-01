import { useEffect, useId, useState, type ReactNode } from "react";
import { api, describeError } from "../api/client";
import type { ReviewStatus, WorkspaceItem, WorkspaceItemKind, WorkspacePage, WorkspaceReview } from "../api/types";
import { formatCount, formatUtc, valueToText } from "../lib/format";
import { Drawer } from "./Drawer";

export const ITEMS_PAGE_SIZE = 25;
export const NOTE_MAX = 2000;

export interface Column<T> {
  label: string;
  cell: (item: T) => ReactNode;
  mono?: boolean;
  right?: boolean;
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  unreviewed: "Unreviewed",
  investigating: "Investigating",
  reviewed: "Reviewed",
};

interface Props<T> {
  analysisId: string;
  kind: WorkspaceItemKind;
  columns: Column<T>[];
  note?: string;
}

type Row<T> = WorkspaceItem<T & { source_record_number: number }>;

export function WorkspaceItemsTable<T>({ analysisId, kind, columns, note }: Props<T>) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<WorkspacePage<Row<T>> | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<Row<T> | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    api.workspace.items<T & { source_record_number: number }>(analysisId, kind, offset, ITEMS_PAGE_SIZE, ctrl.signal).then(setPage, (e) => {
      if (e instanceof DOMException) return;
      setPage(null);
      setError(describeError(e));
    });
    return () => ctrl.abort();
  }, [analysisId, kind, offset, reload]);

  const onSaved = (itemId: string, review: WorkspaceReview) => {
    setPage((p) => p && { ...p, items: p.items.map((i) => (i.workspace_item_id === itemId ? { ...i, review } : i)) });
    setOpen((o) => (o && o.workspace_item_id === itemId ? { ...o, review } : o));
  };

  const total = page?.total ?? 0;

  return (
    <section className="panel p-4" aria-label={`Saved ${kind} items`}>
      {note && (
        <p role="note" className="mb-3 text-xs text-warn">
          {note}
        </p>
      )}
      {error && (
        <div role="alert" className="text-bad">
          <p>
            {error.title}. {error.detail}
          </p>
          <button type="button" className="btn mt-2" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!page && !error && <p className="text-muted">Loading…</p>}
      {page && page.items.length === 0 && <p className="py-8 text-center text-muted">Nothing saved in this view.</p>}
      {page && page.items.length > 0 && (
        <>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={`Saved ${kind} table, scrollable`}>
            <table>
              <thead>
                <tr>
                  <th>Record</th>
                  {columns.map((c) => (
                    <th key={c.label} className={c.right ? "text-right" : ""}>
                      {c.label}
                    </th>
                  ))}
                  <th>Review</th>
                  <th className="col-action">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((item) => (
                  <tr key={item.workspace_item_id}>
                    <td className="mono">#{item.source_record_number}</td>
                    {columns.map((c) => (
                      <td key={c.label} className={`${c.mono ? "mono" : ""} ${c.right ? "text-right tabular-nums" : ""}`}>
                        {c.cell(item)}
                      </td>
                    ))}
                    <td className={item.review && item.review.status !== "unreviewed" ? "" : "text-muted"}>
                      {STATUS_LABEL[item.review?.status ?? "unreviewed"]}
                      {item.review?.note ? <span className="ml-1 text-muted" title={item.review.note}>· note</span> : null}
                    </td>
                    <td className="col-action">
                      <button type="button" className="btn !min-h-8 !px-3" onClick={() => setOpen(item)}>
                        Review<span className="sr-only"> record {item.source_record_number}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p aria-live="polite">
              {offset + 1}–{Math.min(offset + ITEMS_PAGE_SIZE, total)} of {formatCount(total)}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - ITEMS_PAGE_SIZE))}>
                Previous
              </button>
              <button type="button" className="btn" disabled={offset + ITEMS_PAGE_SIZE >= total} onClick={() => setOffset(offset + ITEMS_PAGE_SIZE)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
      {open && <ReviewDrawer analysisId={analysisId} item={open} onClose={() => setOpen(null)} onSaved={onSaved} />}
    </section>
  );
}

function ReviewDrawer<T>({
  analysisId,
  item,
  onClose,
  onSaved,
}: {
  analysisId: string;
  item: Row<T>;
  onClose: () => void;
  onSaved: (itemId: string, review: WorkspaceReview) => void;
}) {
  const noteId = useId();
  const [status, setStatus] = useState<ReviewStatus>(item.review?.status ?? "unreviewed");
  const [text, setText] = useState(item.review?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const { workspace_item_id: itemId, review, ...payload } = item;

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      const saved = await api.workspace.review(analysisId, itemId, status, text.trim() ? text.trim() : null);
      onSaved(itemId, saved);
      setResult({ ok: true, text: `Saved ${formatUtc(saved.updated_at) ?? ""}`.trim() });
    } catch (e) {
      const d = describeError(e);
      setResult({ ok: false, text: `Not saved. ${d.detail}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title={`Record #${item.source_record_number}`} onClose={onClose}>
      <div className="mt-4 space-y-5">
        <section aria-labelledby={`${noteId}-review`}>
          <h3 id={`${noteId}-review`} className="panel-title">
            Your review
          </h3>
          <p className="mt-1 text-xs text-muted">Your own annotation. Marking an item reviewed does not confirm an attack.</p>
          <fieldset className="mt-3 flex flex-wrap gap-2" disabled={busy}>
            <legend className="sr-only">Review status</legend>
            {(Object.keys(STATUS_LABEL) as ReviewStatus[]).map((s) => (
              <label key={s} className={`btn cursor-pointer ${status === s ? "!border-cyan-glow text-cyan-glow" : ""}`}>
                <input type="radio" name="review-status" className="sr-only-input" checked={status === s} onChange={() => setStatus(s)} />
                {STATUS_LABEL[s]}
              </label>
            ))}
          </fieldset>
          <label htmlFor={noteId} className="mt-3 block text-sm">
            Note <span className="text-muted">(optional)</span>
            <textarea
              id={noteId}
              className="field mt-1 min-h-24 w-full"
              maxLength={NOTE_MAX}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="text-right text-xs text-muted">
            {text.length} / {NOTE_MAX}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save review"}
            </button>
            <span aria-live="polite" className="text-sm">
              {result && (
                <span role={result.ok ? "status" : "alert"} className={result.ok ? "text-ok" : "text-bad"}>
                  {result.text}
                </span>
              )}
            </span>
          </div>
          {review && <p className="mt-2 text-xs text-muted">Last saved {formatUtc(review.updated_at) ?? "—"}</p>}
        </section>
        <section>
          <h3 className="panel-title">Saved details</h3>
          <dl className="mono mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {Object.entries(payload).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="whitespace-pre-wrap">{v === null ? "—" : valueToText(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Drawer>
  );
}
