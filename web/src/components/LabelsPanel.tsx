import type { Labels } from "../api/types";
import { formatCount } from "../lib/format";
import { RankedList } from "./RankedList";

export const LABEL_DISCLAIMER =
  "From label columns in your file. Not predictions by this system and not independently verified.";

export function LabelsPanel({ labels }: { labels: Labels | null | undefined }) {
  if (!labels || !labels.available) {
    return (
      <section className="panel p-4" aria-label="Uploaded labels">
        <h2 className="panel-title">Labels in your file</h2>
        <p className="mt-2 text-sm text-muted">
          This file has no usable label column.
          {labels ? ` ${formatCount(labels.unlabeled_records)} record(s) are unlabeled.` : ""}
        </p>
      </section>
    );
  }
  const binary = labels.binary_counts.map((b) => ({ name: b.label, count: b.count }));
  const cats = labels.attack_category_counts.map((c) => ({ name: c.category, count: c.count }));
  return (
    <section className="panel p-4" aria-label="Uploaded labels">
      <h2 className="panel-title">Labels in your file</h2>
      <p className="mt-1 text-xs text-warn">{LABEL_DISCLAIMER}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <dt className="text-muted">Labeled</dt>
          <dd className="text-xl font-bold tabular-nums">{formatCount(labels.labeled_records)}</dd>
        </div>
        <div>
          <dt className="text-muted">Unlabeled</dt>
          <dd className="text-xl font-bold tabular-nums">{formatCount(labels.unlabeled_records)}</dd>
        </div>
        <div>
          <dt className="text-muted">Invalid label</dt>
          <dd className={`text-xl font-bold tabular-nums ${labels.invalid_label_records > 0 ? "text-bad" : ""}`}>
            {formatCount(labels.invalid_label_records)}
          </dd>
        </div>
      </dl>
      <h3 className="mt-4 text-sm font-semibold">Binary label (from file)</h3>
      <RankedList items={binary} label="Uploaded binary label counts" tone="bg-warn" />
      <h3 className="mt-4 text-sm font-semibold">attack_cat (from file)</h3>
      <RankedList items={cats} label="Uploaded attack category counts" tone="bg-warn" empty="No populated attack_cat cells." />
    </section>
  );
}
