import { vi } from "vitest";
import schemaJson from "../../../docs/web/examples/schema.json";
import summaryJson from "../../../docs/web/examples/summary.json";
import findingDetailJson from "../../../docs/web/examples/finding-detail.json";
import unswSummaryJson from "../../../docs/web/examples/unsw-summary.json";
import unswUnlabeledJson from "../../../docs/web/examples/unsw-unlabeled-summary.json";
import unswRecordsJson from "../../../docs/web/examples/unsw-records.json";
import type { Finding, FindingsPage, FlowRecord, RecordsPage, Schema, Summary } from "../api/types";

// TEST-ONLY fixtures: Codex's synthetic examples. Never imported by application code.
export const schema = schemaJson as unknown as Schema;
export const summary = summaryJson as unknown as Summary;
export const finding = findingDetailJson as unknown as Finding;
export const unswSummary = unswSummaryJson as unknown as Summary;
export const unswUnlabeled = unswUnlabeledJson as unknown as Summary;
export const unswRecords = unswRecordsJson as unknown as RecordsPage;

export function recordsPage(total: number, offset: number, limit = 25): RecordsPage {
  const n = Math.max(0, Math.min(limit, total - offset));
  const base: FlowRecord = unswRecords.items[0];
  return {
    items: Array.from({ length: n }, (_, i) => ({ ...base, source_record_number: offset + i + 1, source_id: String(offset + i + 1) })),
    total,
    offset,
    limit,
  };
}

export type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message, fields: [] } }, status);
}

export function findingsPage(total: number, offset: number, limit = 25, over: Partial<Finding> = {}): FindingsPage {
  const n = Math.max(0, Math.min(limit, total - offset));
  return {
    items: Array.from({ length: n }, (_, i) => ({
      ...finding,
      finding_id: `f${offset + i}`,
      source_record_number: offset + i + 1,
      ...over,
    })),
    total,
    offset,
    limit,
  };
}

/** Routes fetch calls by "METHOD path-with-query" prefix. Unmatched calls fail loudly. */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: { method: string; url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url, init });
    const key = Object.keys(routes).find((k) => `${method} ${url}`.startsWith(k));
    if (!key) throw new Error(`Unmocked request: ${method} ${url}`);
    return routes[key](url, init);
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}
