import type { Summary } from "../api/types";

/** Deterministic text summary produced by the backend (not a live AI model). */
export function AnalystPanel({ summary }: { summary: Summary["summary"] }) {
  return (
    <section className="panel p-4" aria-labelledby="summary-h">
      <h2 id="summary-h" className="panel-title">
        Summary
      </h2>
      <p className="mt-2 text-sm leading-relaxed">{summary.text}</p>
    </section>
  );
}
