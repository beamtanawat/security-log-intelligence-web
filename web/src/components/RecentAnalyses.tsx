import { useEffect, useState } from "react";
import { forgetAnalysis, isPastExpiry, readRecent, subscribeRecent, type RecentAnalysis } from "../lib/recentAnalyses";
import { SOURCE_LABEL } from "../lib/capabilities";
import { formatUtc } from "../lib/format";

interface Props {
  currentId: string | null;
  onOpen: (id: string) => void;
}

export function RecentAnalyses({ currentId, onOpen }: Props) {
  const [items, setItems] = useState<RecentAnalysis[]>(readRecent);
  const [, setTick] = useState(0);

  useEffect(() => subscribeRecent(() => setItems(readRecent())), []);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000); // refresh "expired" labels
    return () => clearInterval(t);
  }, []);

  // Nothing to switch to: hide rather than list only the analysis being viewed.
  if (items.every((r) => r.id === currentId)) return null;

  return (
    <nav className="panel no-print p-4" aria-label="Analyses in this session">
      <h2 className="panel-title">Analyses in this session</h2>
      <p className="mt-1 text-xs text-muted">Switch between logs you analyzed in this tab. Results expire 60 minutes after submission.</p>
      <ul className="mt-3 space-y-2">
        {items.map((r) => {
          const expired = isPastExpiry(r);
          const current = r.id === currentId;
          return (
            <li key={r.id} className="flex items-stretch gap-2">
              <button
                type="button"
                className={`btn !h-auto flex-1 !justify-start !py-2 text-left ${current ? "!border-cyan-glow" : ""}`}
                aria-current={current ? "page" : undefined}
                disabled={current}
                onClick={() => onOpen(r.id)}
              >
                <span className="min-w-0">
                  <span className="mono block truncate">{r.filename}</span>
                  <span className="block text-xs font-normal text-muted">
                    {SOURCE_LABEL[r.source_type]}
                    {r.is_demo ? " · demo" : ""} · {formatUtc(r.created_at) ?? "—"}
                    {expired && <span className="text-warn"> · likely expired</span>}
                    {current && <span className="text-cyan-glow"> · viewing</span>}
                  </span>
                </span>
              </button>
              {!current && (
                <button
                  type="button"
                  className="btn !px-3"
                  aria-label={`Remove ${r.filename} from this list`}
                  onClick={() => forgetAnalysis(r.id)}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
