import type {
  Accepted,
  AnomaliesPage,
  ApiErrorBody,
  Evaluation,
  Finding,
  FindingsFilter,
  FindingsPage,
  Job,
  PredictionsPage,
  RecordsPage,
  ReviewStatus,
  Schema,
  SourceType,
  Summary,
  WorkspaceDetail,
  WorkspaceItem,
  WorkspaceList,
  WorkspacePage,
  WorkspaceReview,
  WorkspaceSaved,
} from "./types";

export type ApiErrorKind =
  | "timeout" // 408
  | "not_ready" // 409
  | "expired" // 410
  | "too_large" // 413
  | "invalid" // 422
  | "busy" // 429
  | "forbidden" // 403
  | "not_found" // 404
  | "unavailable" // 503
  | "unauthorized" // 401
  | "network"
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly fields: string[];
  readonly retryAfter: number | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    opts: { status?: number | null; code?: string | null; fields?: string[]; retryAfter?: number | null } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.fields = opts.fields ?? [];
    this.retryAfter = opts.retryAfter ?? null;
  }
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  408: "timeout",
  409: "not_ready",
  410: "expired",
  413: "too_large",
  422: "invalid",
  429: "busy",
  503: "unavailable",
};

async function toApiError(res: Response): Promise<ApiError> {
  let body: { error?: Partial<ApiErrorBody> } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null; // e.g. upstream plain-text 400 for untrusted Host
  }
  const retry = Number(res.headers.get("Retry-After"));
  return new ApiError(KIND_BY_STATUS[res.status] ?? "unknown", body?.error?.message ?? `Request failed (HTTP ${res.status}).`, {
    status: res.status,
    code: body?.error?.code ?? null,
    fields: body?.error?.fields ?? [],
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
  });
}

/**
 * Signed-in jobs must carry the bearer token on every request (upload, polling, results, workspace).
 * The auth layer installs these hooks; anonymous use keeps the defaults and sends no Authorization header.
 */
interface AuthHooks {
  getToken: () => Promise<string | null>;
  onTokenRejected: () => void;
}
let authHooks: AuthHooks = { getToken: async () => null, onTokenRejected: () => undefined };
export function setAuthHooks(hooks: AuthHooks) {
  authHooks = hooks;
}

async function send(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await authHooks.getToken();
  const headers = token ? { ...((init.headers as Record<string, string> | undefined) ?? {}), Authorization: `Bearer ${token}` } : init.headers;
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init, ...(headers ? { headers } : {}) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("network", "Could not reach the analysis service. Check your connection and try again.");
  }
  if (!res.ok) {
    const error = await toApiError(res);
    if (error.kind === "unauthorized" && token && error.code === "AUTH_INVALID") authHooks.onTokenRejected();
    throw error;
  }
  return res;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await send(url, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const jsonBody = (body: unknown): RequestInit => ({ body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

export function filterParams(filter: FindingsFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.severity) p.set("severity", filter.severity);
  if (filter.rule_id) p.set("rule_id", filter.rule_id);
  return p;
}

const base = (id: string) => `/api/analyses/${encodeURIComponent(id)}`;

export const api = {
  schema: (signal?: AbortSignal) => request<Schema>("/api/schema", { signal }),

  evaluation: (signal?: AbortSignal) => request<Evaluation>("/api/evaluation", { signal }),

  /** Never retried automatically: a second POST would create a second job. */
  upload(file: File, sourceType: SourceType): Promise<Accepted> {
    const form = new FormData();
    form.append("file", file); // no Content-Type: the browser sets the multipart boundary
    form.append("source_type", sourceType);
    return request<Accepted>("/api/uploads", { method: "POST", body: form });
  },

  demo: (sourceType: SourceType) =>
    request<Accepted>(`/api/demo?${new URLSearchParams({ source_type: sourceType })}`, { method: "POST" }),

  /** `statusUrl` is the server-provided status_url, used verbatim. */
  job: (statusUrl: string, signal?: AbortSignal) => request<Job>(statusUrl, { signal }),

  summary: (id: string, signal?: AbortSignal) => request<Summary>(`${base(id)}/summary`, { signal }),

  findings(id: string, filter: FindingsFilter, offset: number, limit: number, signal?: AbortSignal) {
    const p = filterParams(filter);
    p.set("offset", String(offset));
    p.set("limit", String(limit));
    return request<FindingsPage>(`${base(id)}/findings?${p}`, { signal });
  },

  records(id: string, offset: number, limit: number, signal?: AbortSignal) {
    const p = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    return request<RecordsPage>(`${base(id)}/records?${p}`, { signal });
  },

  predictions(id: string, offset: number, limit: number, signal?: AbortSignal) {
    const p = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    return request<PredictionsPage>(`${base(id)}/predictions?${p}`, { signal });
  },

  anomalies(id: string, offset: number, limit: number, signal?: AbortSignal) {
    const p = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    return request<AnomaliesPage>(`${base(id)}/anomalies?${p}`, { signal });
  },

  finding: (id: string, findingId: string, signal?: AbortSignal) =>
    request<Finding>(`${base(id)}/findings/${encodeURIComponent(findingId)}`, { signal }),

  exportUrl(id: string, format: "json" | "csv", filter: FindingsFilter): string {
    const p = filterParams(filter);
    p.set("format", format);
    return `${base(id)}/export?${p}`;
  },

  /** Export through fetch so a signed-in job's bearer token is sent; a plain link cannot carry it. */
  async downloadExport(id: string, format: "json" | "csv", filter: FindingsFilter): Promise<void> {
    const res = await send(api.exportUrl(id, format, filter));
    const blob = await res.blob();
    const name = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `findings.${format}`;
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  },

  workspace: {
    me: (signal?: AbortSignal) => request<{ user_id: string }>("/api/workspace/me", { signal }),
    save: (id: string) => request<WorkspaceSaved>(`/api/workspace/analyses/${encodeURIComponent(id)}/save`, { method: "POST" }),
    list(offset: number, limit: number, signal?: AbortSignal) {
      const p = new URLSearchParams({ offset: String(offset), limit: String(limit) });
      return request<WorkspaceList>(`/api/workspace/analyses?${p}`, { signal });
    },
    get: (id: string, signal?: AbortSignal) => request<WorkspaceDetail>(`/api/workspace/analyses/${encodeURIComponent(id)}`, { signal }),
    items<T>(id: string, kind: string, offset: number, limit: number, signal?: AbortSignal) {
      const p = new URLSearchParams({ kind, offset: String(offset), limit: String(limit) });
      return request<WorkspacePage<WorkspaceItem<T>>>(`/api/workspace/analyses/${encodeURIComponent(id)}/items?${p}`, { signal });
    },
    review: (id: string, itemId: string, status: ReviewStatus, note: string | null) =>
      request<WorkspaceReview>(`/api/workspace/analyses/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/review`, {
        method: "POST",
        ...jsonBody({ status, note }),
      }),
    remove: (id: string) => request<void>(`/api/workspace/analyses/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  sampleUrl: (sourceType: SourceType) => `/api/sample?${new URLSearchParams({ source_type: sourceType })}`,
};

export function describeError(e: unknown): { title: string; detail: string } {
  if (!(e instanceof ApiError)) return { title: "Unexpected error", detail: "Something went wrong. Return to upload and try again." };
  switch (e.kind) {
    case "timeout":
      return { title: "Upload timed out", detail: "The file did not arrive within 30 seconds. Nothing was analyzed. Try again." };
    case "not_ready":
      return { title: "Analysis not ready", detail: "The analysis has not finished yet. Check its status again shortly." };
    case "expired":
      return { title: "Analysis expired", detail: "Results are kept for at most 60 minutes. Upload the file again." };
    case "too_large":
      return { title: "File too large", detail: e.message };
    case "invalid":
      return { title: "File or filter not accepted", detail: e.message };
    case "busy":
      return {
        title: "Service is busy",
        detail: `${e.message}${e.retryAfter ? ` Try again in about ${e.retryAfter} s.` : ""}`,
      };
    case "forbidden":
      return { title: "Request blocked", detail: e.message };
    case "not_found":
      return { title: "Analysis not found", detail: "It may belong to another browser session or no longer exist. Upload again." };
    case "unavailable":
      return { title: "Service unavailable", detail: e.message };
    case "unauthorized":
      return e.code === "AUTH_REQUIRED"
        ? { title: "Sign in required", detail: "Sign in to use your saved history." }
        : { title: "Session expired", detail: "Your session is invalid or expired. Sign in again." };
    case "network":
      return { title: "Service unreachable", detail: e.message };
    default:
      return { title: "Request failed", detail: e.message };
  }
}
