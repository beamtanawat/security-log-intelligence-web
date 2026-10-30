import type { Summary } from "../api/types";

interface Props {
  summary: Summary["summary"];
  chatAvailable: boolean;
  onOpenFinding: ((id: string) => void) | null;
  label: string;
}

export function AnalystPanel({ summary, chatAvailable, onOpenFinding, label }: Props) {
  return (
    <section className="panel p-4" aria-labelledby="summary-h">
      <h2 id="summary-h" className="panel-title">
        {label}
      </h2>
      <p className="mt-1 text-xs text-muted">
        Mode: <span className="mono">{summary.mode}</span>. Generated deterministically from this analysis, not by a live AI model.
      </p>
      <p className="mt-3">{summary.text}</p>
      {onOpenFinding && summary.finding_ids.length > 0 && (
        <div className="mt-3">
          <p className="text-sm text-muted">Referenced findings:</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {summary.finding_ids.map((id) => (
              <li key={id}>
                <button type="button" className="btn mono !min-h-8 !px-2" onClick={() => onOpenFinding(id)} title={id}>
                  {id.slice(0, 10)}…
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!chatAvailable && <p className="mt-4 text-sm text-muted">Analyst chat is not available in this release.</p>}
    </section>
  );
}
