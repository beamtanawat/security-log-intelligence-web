import type { Summary } from "../api/types";
import { anomaliesOf, capabilitiesOf, predictionsOf } from "../lib/capabilities";
import { formatCount } from "../lib/format";

interface Card {
  label: string;
  value: number;
  note?: string;
  tone?: string;
}

export function SummaryCards({ summary }: { summary: Summary }) {
  const c = summary.counts;
  const caps = capabilitiesOf(summary);
  const inference = predictionsOf(summary);
  const anomaly = anomaliesOf(summary);
  const skipped = c.input_records - c.analyzed_records;
  const cards: Card[] = [
    { label: "Records analyzed", value: c.analyzed_records, note: skipped > 0 ? `of ${formatCount(c.input_records)} in file` : undefined },
  ];
  // Unsupported counts are omitted, never shown as 0.
  if (caps.findings) cards.push({ label: "Rule findings", value: c.findings, tone: "text-cyan-glow" });
  if (caps.denied_events && c.denied_events !== null) cards.push({ label: "Denied events", value: c.denied_events, tone: "text-warn" });
  if (anomaly) {
    cards.push({
      label: "Anomaly scored",
      value: anomaly.scored_records,
      note: anomaly.unscored_records > 0 ? `${formatCount(anomaly.unscored_records)} not scored` : undefined,
    });
  }
  if (inference) {
    const count = (name: string) => inference.prediction_counts.find((p) => p.class_name === name)?.count ?? 0;
    cards.push({
      label: "Predicted attack",
      value: count("ATTACK"),
      note: `${formatCount(count("NORMAL"))} predicted normal`,
      tone: "text-warn",
    });
  }
  cards.push({
    label: "Invalid records",
    value: summary.quality.invalid_records,
    tone: summary.quality.invalid_records > 0 ? "text-bad" : undefined,
  });
  return (
    <section aria-label="Key counts" className="strip">
      {cards.map((card) => (
        <div key={card.label}>
          <p className="text-sm text-muted">{card.label}</p>
          <p className={`mt-0.5 text-[1.75rem] font-semibold leading-tight tabular-nums ${card.tone ?? "text-text"}`}>{formatCount(card.value)}</p>
          {card.note && <p className="text-xs text-muted">{card.note}</p>}
        </div>
      ))}
    </section>
  );
}
