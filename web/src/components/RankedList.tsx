import { formatCount } from "../lib/format";

interface Props {
  items: { name: string; count: number }[];
  label: string;
  mono?: boolean;
  empty?: string;
  tone?: string;
}

/** Ranked counts with an inline bar: faster to read than a small chart, and exact numbers stay visible. */
export function RankedList({ items, label, mono = false, empty = "No data in this analysis.", tone = "bg-cyan-glow" }: Props) {
  if (items.length === 0) return <p className="py-3 text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ol className="mt-2 space-y-2" aria-label={label}>
      {items.map((i) => (
        <li key={i.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={`min-w-0 truncate ${mono ? "mono" : ""}`} title={i.name}>
              {i.name}
            </span>
            <span className="tabular-nums text-muted">{formatCount(i.count)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-ink-700" aria-hidden="true">
            <div className={`bar-fill h-1.5 rounded-full ${tone}`} style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
