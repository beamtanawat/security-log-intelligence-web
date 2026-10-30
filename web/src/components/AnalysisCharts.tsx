import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Summary } from "../api/types";
import { capabilitiesOf, sourceOf } from "../lib/capabilities";
import { binLabel, TIME_NOTE } from "../lib/format";

const AXIS = { fill: "#9fb2cf", fontSize: 12 };
const PALETTE = ["#22d3ee", "#fbbf24", "#34d399", "#a78bfa", "#fb7185"];
const TOOLTIP = { background: "#0a1424", border: "1px solid #213454", color: "#e6eefb" };

export function ChartPanel({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="panel p-4" aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted">{text}</p>;
}

export function HBar({ data, label }: { data: { name: string; count: number }[]; label: string }) {
  if (data.length === 0) return <Empty text="No data in this analysis." />;
  return (
    <div role="img" aria-label={`${label}: ${data.map((d) => `${d.name} ${d.count}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke="#213454" horizontal={false} />
          <XAxis type="number" tick={AXIS} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={160} tick={AXIS} />
          <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(34,211,238,0.08)" }} />
          <Bar dataKey="count" fill="#22d3ee" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnalysisCharts({ summary }: { summary: Summary }) {
  const caps = capabilitiesOf(summary);
  const isUnsw = sourceOf(summary) === "unsw_nb15";
  const timeline = summary.timeline.map((t) => ({ label: binLabel(t.time, summary.time.bin_seconds), count: t.count }));
  const rules = summary.rule_counts.map((r) => ({ name: r.rule_id.replace(/^fortigate\./, ""), count: r.count }));
  const sources = summary.top_sources.map((s) => ({ name: s.identifier, count: s.count }));
  const apps = summary.top_applications.map((a) => ({ name: a.name, count: a.count }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {caps.timeline && (
      <div className="xl:col-span-2">
        <ChartPanel title="Events over time (UTC)" note={`${TIME_NOTE} Counts are events, not findings.`}>
          {timeline.length === 0 ? (
            <Empty text="No usable event times in this file, so no timeline is drawn." />
          ) : (
            <div role="img" aria-label={`Event counts per time bin, ${timeline.length} bins`}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={timeline} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke="#213454" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} minTickGap={24} />
                  <YAxis tick={AXIS} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(34,211,238,0.08)" }} />
                  <Bar dataKey="count" name="Events" fill="#22d3ee" isAnimationActive={false} />
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
      </div>
      )}
      {caps.findings && (
      <ChartPanel title="Findings by rule">
        {rules.every((r) => r.count === 0) ? (
          <Empty text="No findings, so no rule distribution." />
        ) : (
          <div className="flex flex-wrap items-center gap-4" role="img" aria-label={`Findings by rule: ${rules.map((r) => `${r.name} ${r.count}`).join(", ")}`}>
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rules} dataKey="count" nameKey="name" innerRadius={48} outerRadius={72} stroke="none" isAnimationActive={false}>
                    {rules.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted">Findings</span>
                <span className="text-xl font-bold">{rules.reduce((a, r) => a + r.count, 0)}</span>
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              {rules.map((r, i) => (
                <li key={r.name} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="mono">{r.name}</span>
                  <span className="text-muted">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ChartPanel>
      )}
      {caps.network_identifiers && (
      <ChartPanel title="Top source identifiers" note="Opaque identifiers from the file; not resolved to IP addresses or countries.">
        <HBar data={sources} label="Top source identifiers" />
      </ChartPanel>
      )}
      <ChartPanel title={isUnsw ? "Top services" : "Top applications"} note={isUnsw ? "From the uploaded service column." : undefined}>
        <HBar data={apps} label={isUnsw ? "Top services" : "Top applications"} />
      </ChartPanel>
    </div>
  );
}

export function PortsList({ summary }: { summary: Summary }) {
  const dots = ["bg-warn", "bg-cyan-glow", "bg-bad", "bg-ok", "bg-[#a78bfa]"];
  return (
    <section className="panel p-4" aria-label="Top destination ports">
      <h2 className="panel-title">Top destination ports</h2>
      {summary.top_ports.length === 0 ? (
        <Empty text="No ports in this analysis." />
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-1">
          {summary.top_ports.slice(0, 6).map((p, i) => (
            <li key={p.port} className="flex items-start gap-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dots[i % dots.length]}`} />
              <span>
                <span className="block font-semibold">Port {p.port}</span>
                <span className="text-sm text-muted">{p.count.toLocaleString("en-US")} events</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
