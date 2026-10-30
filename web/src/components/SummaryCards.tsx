import type { Summary } from "../api/types";
import { capabilitiesOf } from "../lib/capabilities";
import { formatCount } from "../lib/format";

interface Card {
  label: string;
  value: number;
  note: string;
  tone: string;
}

export function SummaryCards({ summary }: { summary: Summary }) {
  const c = summary.counts;
  const caps = capabilitiesOf(summary);
  const cards: Card[] = [
    { label: "Records analyzed", value: c.analyzed_records, note: `of ${formatCount(c.input_records)} input records`, tone: "text-cyan-glow" },
  ];
  // Unsupported counts are omitted, never shown as 0.
  if (caps.denied_events && c.denied_events !== null) {
    cards.push({ label: "Denied events", value: c.denied_events, note: "source action = deny; not an attack verdict", tone: "text-warn" });
  }
  if (caps.findings) {
    cards.push({ label: "Rule findings", value: c.findings, note: "one event can match several rules", tone: "text-ok" });
  }
  cards.push(
    { label: "Records with normalization notes", value: c.records_with_issues, note: "includes expected missing values", tone: "text-text" },
    {
      label: "Invalid records",
      value: summary.quality.invalid_records,
      note: "failed value conversion",
      tone: summary.quality.invalid_records > 0 ? "text-bad" : "text-text",
    },
  );
  return (
    <section aria-label="Key counts" className="grid grid-cols-2 gap-3 lg:grid-cols-1">
      {cards.map((card) => (
        <div key={card.label} className="panel p-4 text-center">
          <p className="panel-title">{card.label}</p>
          <p className={`mt-2 text-4xl font-bold tabular-nums ${card.tone}`}>{formatCount(card.value)}</p>
          <p className="mt-1 text-xs text-muted">{card.note}</p>
        </div>
      ))}
    </section>
  );
}
