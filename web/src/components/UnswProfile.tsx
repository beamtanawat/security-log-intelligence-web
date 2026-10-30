import type { NumericStat, Summary } from "../api/types";
import { formatCount } from "../lib/format";
import { ChartPanel, HBar } from "./AnalysisCharts";

function stat(v: number | null): string {
  if (v === null) return "no data"; // never shown as 0
  return Number.isInteger(v) ? formatCount(v) : v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function NumericStatsTable({ stats }: { stats: NumericStat[] }) {
  return (
    <ChartPanel
      title="Numeric feature profile"
      note="Computed only from finite, non-negative values. Missing and invalid cells are counted separately, never imputed."
    >
      {stats.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No numeric statistics in this analysis.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Numeric feature statistics, scrollable">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Count</th>
                <th>Missing</th>
                <th>Invalid</th>
                <th>Min</th>
                <th>Max</th>
                <th>Mean</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.field}>
                  <td className="mono">{s.field}</td>
                  <td className="tabular-nums">{formatCount(s.count)}</td>
                  <td className={`tabular-nums ${s.missing > 0 ? "text-warn" : ""}`}>{formatCount(s.missing)}</td>
                  <td className={`tabular-nums ${s.invalid > 0 ? "text-bad" : ""}`}>{formatCount(s.invalid)}</td>
                  <td className={`tabular-nums ${s.min === null ? "text-muted" : ""}`}>{stat(s.min)}</td>
                  <td className={`tabular-nums ${s.max === null ? "text-muted" : ""}`}>{stat(s.max)}</td>
                  <td className={`tabular-nums ${s.mean === null ? "text-muted" : ""}`}>{stat(s.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartPanel>
  );
}

export function UnswProfile({ summary }: { summary: Summary }) {
  const protocols = (summary.protocol_counts ?? []).map((p) => ({ name: p.protocol, count: p.count }));
  const states = (summary.state_counts ?? []).map((s) => ({ name: s.state, count: s.count }));
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartPanel title="Protocols" note="From the uploaded proto column.">
        <HBar data={protocols} label="Protocols" />
      </ChartPanel>
      <ChartPanel title="Connection states" note="From the uploaded state column.">
        <HBar data={states} label="Connection states" />
      </ChartPanel>
      <div className="xl:col-span-2">
        <NumericStatsTable stats={summary.numeric_stats ?? []} />
      </div>
    </div>
  );
}
