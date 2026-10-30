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
    { label: "Records analyzed", value: c.analyzed_records, note: `of ${formatCount(c.input_records)} input records`, tone: "text-text" },
  ];
  // Unsupported counts are omitted, never shown as 0.
  if (caps.denied_events && c.denied_events !== null) {
    cards.push({ label: "Denied events", value: c.denied_events, note: "source action = deny; not an attack verdict", tone: "text-warn" });
  }
  if (caps.findings) {
    cards.push({ label: "Rule findings", value: c.findings, note: "one event can match several rules", tone: "text-cyan-glow" });
  }
  cards.push(
    { label: "Records with notes", value: c.records_with_issues, note: "includes expected missing values", tone: "text-text" },
    {
      label: "Invalid records",
      value: summary.quality.invalid_records,
      note: "failed value conversion",
      tone: summary.quality.invalid_records > 0 ? "text-bad" : "text-text",
    },
  );
  return (
    <section aria-label="Key counts" className="strip">
      {cards.map((card) => (
        <div key={card.label}>
          <p className="text-sm text-muted">{card.label}</p>
          <p className={`mt-0.5 text-[1.75rem] font-semibold leading-tight tabular-nums ${card.tone}`}>{formatCount(card.value)}</p>
          <p className="mt-0.5 text-xs text-muted">{card.note}</p>
        </div>
      ))}
    </section>
  );
}
