import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Summary } from "../api/types";
import { sourceOf } from "../lib/capabilities";
import { binLabel, TIME_NOTE } from "../lib/format";
import { RankedList } from "./RankedList";

const AXIS = { fill: "#93a5c2", fontSize: 12, fontFamily: "IBM Plex Mono, monospace" };
const TOOLTIP = { background: "#101b2d", border: "1px solid #273b5c", color: "#e6edf7", borderRadius: 6 };

export function ChartPanel({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="panel p-4" aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      {note && <p className="panel-sub mt-0.5">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted">{text}</p>;
}

export function TimelinePanel({ summary }: { summary: Summary }) {
  const timeline = summary.timeline.map((t) => ({ label: binLabel(t.time, summary.time.bin_seconds), count: t.count }));
  return (
    <ChartPanel title="Events over time (UTC)" note={`${TIME_NOTE} Counts are events, not findings.`}>
      {timeline.length === 0 ? (
        <Empty text="No usable event times in this file, so no timeline is drawn." />
      ) : (
        <div role="img" aria-label={`Event counts per time bin, ${timeline.length} bins`}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={timeline} margin={{ left: -12, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1f3150" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} minTickGap={28} tickLine={false} axisLine={{ stroke: "#273b5c" }} />
              <YAxis tick={AXIS} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(56,189,248,0.08)" }} />
              <Bar dataKey="count" name="Events" fill="#38bdf8" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {summary.time.unknown_records > 0 && (
        <p className="mt-2 text-xs text-warn">
          {summary.time.unknown_records} record(s) have missing or unusable times and are not on this chart.
        </p>
      )}
    </ChartPanel>
  );
}

export function RulesBreakdown({ summary }: { summary: Summary }) {
  const rules = summary.rule_counts.map((r) => ({ name: r.rule_id.replace(/^fortigate\./, ""), count: r.count }));
  return (
    <ChartPanel title="Findings by rule">
      <RankedList items={rules} label="Findings by rule" mono empty="No findings, so no rule distribution." />
    </ChartPanel>
  );
}

export function SourcesList({ summary }: { summary: Summary }) {
  return (
    <ChartPanel title="Top source identifiers" note="Opaque identifiers from the file; not resolved to IP addresses or countries.">
      <RankedList items={summary.top_sources.map((s) => ({ name: s.identifier, count: s.count }))} label="Top source identifiers" mono />
    </ChartPanel>
  );
}

export function PortsList({ summary }: { summary: Summary }) {
  return (
    <ChartPanel title="Top destination ports">
      <RankedList items={summary.top_ports.map((p) => ({ name: String(p.port), count: p.count }))} label="Top destination ports" mono />
    </ChartPanel>
  );
}

export function ApplicationsList({ summary }: { summary: Summary }) {
  const isUnsw = sourceOf(summary) === "unsw_nb15";
  const title = isUnsw ? "Top services" : "Top applications";
  return (
    <ChartPanel title={title} note={isUnsw ? "From the uploaded service column." : undefined}>
      <RankedList items={summary.top_applications.map((a) => ({ name: a.name, count: a.count }))} label={title} />
    </ChartPanel>
  );
}
