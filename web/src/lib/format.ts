export const TIME_NOTE =
  "Times are inferred by assuming Unix epoch seconds, shown in UTC. The source's timestamp semantics are not verified.";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Returns null for missing or unparseable input: callers must not invent a date. */
export function formatUtc(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${dateTime.format(d)} UTC`;
}

export function timeOrUnknown(iso: string | null | undefined): string {
  return formatUtc(iso) ?? "Unknown";
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KiB`;
  return `${n} B`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Evidence/log values are rendered as text only, never as HTML. */
export function valueToText(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v, null, 2);
}

export function binLabel(iso: string, binSeconds: number | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const long = binSeconds !== null && binSeconds >= 86400;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    ...(long ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }),
  }).format(d);
}

/** Shape glyph so severity never depends on color alone. */
export const SEVERITY_GLYPH: Record<string, string> = { INFORMATIONAL: "○", LOW: "◔", MEDIUM: "◑", HIGH: "●" };
