import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, setAuthHooks } from "../api/client";
import type { Summary, WorkspaceDetail } from "../api/types";
import { DashboardPage } from "../pages/DashboardPage";
import { HistoryPage } from "../pages/HistoryPage";
import { SavedAnalysisPage } from "../pages/SavedAnalysisPage";
import { UploadPage } from "../pages/UploadPage";
import { readRecent, rememberAnalysis } from "../lib/recentAnalyses";
import { apiError, finding, findingsPage, json, mockFetch, schema, summary } from "./helpers";

// Signed-in state is simulated: these tests cover how the UI uses a session, not Supabase itself.
vi.mock("../lib/auth", () => ({
  authConfigured: true,
  useAuth: () => ({ status: "signed_in", user: { id: "11111111-1111-1111-1111-111111111111", email: "analyst@example.test" } }),
  getAuthState: () => ({ status: "signed_in", user: { id: "11111111-1111-1111-1111-111111111111", email: null } }),
  subscribeAuth: () => () => undefined,
  identityKey: () => "user:11111111-1111-1111-1111-111111111111",
  initAuth: () => undefined,
  getAccessToken: async () => "test-access-token",
  expireSession: async () => undefined,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => undefined,
}));

const TOKEN = "test-access-token";
const onRejected = vi.fn();

beforeEach(() => {
  onRejected.mockReset();
  setAuthHooks({ getToken: async () => TOKEN, onTokenRejected: onRejected });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setAuthHooks({ getToken: async () => null, onTokenRejected: () => undefined });
});

// Name-based role queries are slow on these tables in jsdom; match buttons by text instead.
const button = async (text: string | RegExp, scope: HTMLElement = document.body) => {
  await waitFor(() => expect(within(scope).getAllByRole("button").some((b) => matches(b, text))).toBe(true));
  return within(scope).getAllByRole("button").find((b) => matches(b, text))!;
};
const matches = (el: HTMLElement, text: string | RegExp) =>
  typeof text === "string" ? el.textContent === text : text.test(el.textContent ?? "");

const authHeader = (init?: RequestInit) => (init?.headers as Record<string, string> | undefined)?.Authorization;

const saved = {
  analysis_id: "a1b2",
  source_type: "fortigate" as const,
  filename: "branch-office.csv",
  status: "completed",
  created_at: "2026-10-31T10:00:00+00:00",
  expires_at: "2026-11-07T10:00:00+00:00",
};

describe("bearer token on signed-in requests", () => {
  it("sends the token on upload, polling and results, without a manual Content-Type", async () => {
    const accepted = { analysis_id: "abc", state: "queued", status_url: "/api/jobs/abc" };
    const { calls } = mockFetch({
      "GET /api/schema": () => json(schema),
      "POST /api/uploads": () => json(accepted, 202),
      "GET /api/jobs/abc": () => json({ analysis_id: "abc", state: "running", stage: null, error: null, expires_at: saved.expires_at }),
    });
    const user = userEvent.setup();
    render(<UploadPage onCompleted={() => undefined} />);
    await screen.findByRole("radio", { name: /fortigate csv/i });
    await user.upload(screen.getByLabelText(/choose a file/i), new File(["a\n1\n"], "log.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: /analyze file/i }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/jobs/abc")).toBe(true));

    const post = calls.find((c) => c.method === "POST")!;
    expect(authHeader(post.init)).toBe(`Bearer ${TOKEN}`);
    expect((post.init!.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(post.init!.body).toBeInstanceOf(FormData);
    expect(authHeader(calls.find((c) => c.url === "/api/jobs/abc")!.init)).toBe(`Bearer ${TOKEN}`);
  });

  it("sends the token when reading a dashboard and offers Save to history", async () => {
    const { calls } = mockFetch({
      [`GET /api/analyses/${summary.analysis_id}/summary`]: () => json(summary),
      [`GET /api/analyses/${summary.analysis_id}/findings?`]: () => json(findingsPage(3, 0)),
      [`POST /api/workspace/analyses/${summary.analysis_id}/save`]: () => json({ analysis_id: summary.analysis_id, created: true }, 201),
    });
    const user = userEvent.setup();
    render(<DashboardPage analysisId={summary.analysis_id} onNewUpload={() => undefined} onExpired={vi.fn()} onOpenAnalysis={() => undefined} />);
    await screen.findByText("synthetic-fortigate.csv");
    await waitFor(() => expect(calls.some((c) => c.url.includes("/findings?"))).toBe(true));
    for (const c of calls) expect(authHeader(c.init)).toBe(`Bearer ${TOKEN}`);

    await user.click(screen.getByRole("button", { name: /save to history/i }));
    expect(await screen.findByText(/saved for 7 days/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open saved copy/i })).toHaveAttribute("href", `#/history/${summary.analysis_id}`);
    // Signed-in export cannot use a bare link; it is a fetch carrying the token.
    expect(screen.queryByRole("link", { name: /export csv/i })).not.toBeInTheDocument();
  });

  it("explains a full history instead of claiming the save worked", async () => {
    mockFetch({
      [`GET /api/analyses/${summary.analysis_id}/summary`]: () => json(summary),
      [`GET /api/analyses/${summary.analysis_id}/findings?`]: () => json(findingsPage(0, 0)),
      [`POST /api/workspace/analyses/${summary.analysis_id}/save`]: () => apiError(429, "WORKSPACE_CAPACITY", "Workspace is full."),
    });
    const user = userEvent.setup();
    render(<DashboardPage analysisId={summary.analysis_id} onNewUpload={() => undefined} onExpired={vi.fn()} onOpenAnalysis={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: /save to history/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not saved.*history is full/i);
    expect(screen.queryByText(/saved for 7 days/i)).not.toBeInTheDocument();
  });

  it("drops the local session when the API rejects the token", async () => {
    mockFetch({ "GET /api/workspace/analyses?": () => apiError(401, "AUTH_INVALID", "Your session is invalid or expired.") });
    await expect(api.workspace.list(0, 20)).rejects.toMatchObject({ kind: "unauthorized" });
    expect(onRejected).toHaveBeenCalledTimes(1);
  });
});

describe("saved history", () => {
  it("lists saved analyses with expiry and the retention notice", async () => {
    mockFetch({ "GET /api/workspace/analyses?offset=0&limit=20": () => json({ items: [saved], total: 1, offset: 0, limit: 20 }) });
    render(<HistoryPage />);
    expect(await screen.findByRole("link", { name: "branch-office.csv" })).toHaveAttribute("href", "#/history/a1b2");
    expect(screen.getByText("1 of 20 saved")).toBeInTheDocument();
    expect(screen.getByText(/07 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByText(/not your original CSV/i)).toBeInTheDocument();
    expect(screen.getByText(/sleeping free instance/i)).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    mockFetch({ "GET /api/workspace/analyses?": () => json({ items: [], total: 0, offset: 0, limit: 20 }) });
    render(<HistoryPage />);
    expect(await screen.findByText(/no saved analyses yet/i)).toBeInTheDocument();
  });

  it("shows the API error and no placeholder rows when the workspace is unavailable", async () => {
    mockFetch({ "GET /api/workspace/analyses?": () => apiError(503, "WORKSPACE_UNAVAILABLE", "Workspace storage is unavailable.") });
    render(<HistoryPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace storage is unavailable.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("deletes only after confirmation and reloads the list", async () => {
    let listed = [saved];
    const { calls } = mockFetch({
      "GET /api/workspace/analyses?": () => json({ items: listed, total: listed.length, offset: 0, limit: 20 }),
      "DELETE /api/workspace/analyses/a1b2": () => {
        listed = [];
        return new Response(null, { status: 204 });
      },
    });
    const user = userEvent.setup();
    render(<HistoryPage />);
    await user.click(await button("Delete branch-office.csv"));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await user.click(await button("Confirm delete"));
    expect(await screen.findByText(/no saved analyses yet/i)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("keeps the row and reports a failed delete", async () => {
    mockFetch({
      "GET /api/workspace/analyses?": () => json({ items: [saved], total: 1, offset: 0, limit: 20 }),
      "DELETE /api/workspace/analyses/a1b2": () => apiError(503, "WORKSPACE_UNAVAILABLE", "Workspace storage is unavailable."),
    });
    const user = userEvent.setup();
    render(<HistoryPage />);
    await user.click(await button("Delete branch-office.csv"));
    await user.click(await button("Confirm delete"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/delete failed.*nothing was removed/i);
    expect(screen.getByRole("link", { name: "branch-office.csv" })).toBeInTheDocument();
  });
});

describe("saved analysis detail and review", () => {
  const detail: WorkspaceDetail = { ...saved, summary: summary as Summary };
  const item = { ...finding, workspace_item_id: "item1", review: null };

  it("saves a review and shows the stored status", async () => {
    const { calls } = mockFetch({
      "GET /api/workspace/analyses/a1b2/items?kind=finding": () => json({ items: [item], total: 1, offset: 0, limit: 25 }),
      "GET /api/workspace/analyses/a1b2/items?kind=quality": () => json({ items: [], total: 0, offset: 0, limit: 25 }),
      "GET /api/workspace/analyses/a1b2": () => json(detail),
      "POST /api/workspace/analyses/a1b2/items/item1/review": () =>
        json({ status: "investigating", note: "Check context", updated_at: "2026-10-31T12:00:00+00:00" }),
    });
    const user = userEvent.setup();
    render(<SavedAnalysisPage analysisId="a1b2" />);
    expect(await screen.findByRole("heading", { name: "branch-office.csv" })).toBeInTheDocument();
    expect(screen.getByText(/does not confirm an attack/i)).toBeInTheDocument();

    const table = await screen.findByRole("region", { name: /saved finding table/i });
    expect(within(table).getByText("Unreviewed")).toBeInTheDocument();
    await user.click(await button("Review record 1", table));
    await user.click(screen.getByRole("radio", { name: "Investigating" }));
    await user.type(screen.getByRole("textbox", { name: /note/i }), "Check context");
    await user.click(await button("Save review"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved 31 Oct 2026, 12:00:00 UTC");

    const post = calls.find((c) => c.method === "POST")!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ status: "investigating", note: "Check context" });
    expect((post.init!.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(authHeader(post.init)).toBe(`Bearer ${TOKEN}`);
    expect(within(table).getByText("Investigating")).toBeInTheDocument();
  });

  it("does not claim a review was saved when the API fails", async () => {
    mockFetch({
      "GET /api/workspace/analyses/a1b2/items?kind=finding": () => json({ items: [item], total: 1, offset: 0, limit: 25 }),
      "GET /api/workspace/analyses/a1b2/items?kind=quality": () => json({ items: [], total: 0, offset: 0, limit: 25 }),
      "GET /api/workspace/analyses/a1b2": () => json(detail),
      "POST /api/workspace/analyses/a1b2/items/item1/review": () => apiError(404, "NOT_FOUND", "Workspace item not found."),
    });
    const user = userEvent.setup();
    render(<SavedAnalysisPage analysisId="a1b2" />);
    const table = await screen.findByRole("region", { name: /saved finding table/i });
    await user.click(await button("Review record 1", table));
    await user.click(screen.getByRole("radio", { name: "Reviewed" }));
    await user.click(await button("Save review"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Not saved/);
    expect(within(table).getByText("Unreviewed")).toBeInTheDocument();
  });

  it("reports a missing or expired snapshot without inventing data", async () => {
    mockFetch({ "GET /api/workspace/analyses/a1b2": () => apiError(404, "NOT_FOUND", "Workspace analysis not found.") });
    render(<SavedAnalysisPage analysisId="a1b2" />);
    expect(await screen.findByRole("heading", { name: /saved analysis not found/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});

describe("recent analyses per identity", () => {
  it("hides anonymous entries from a signed-in user and keeps them stored", () => {
    const anon = { id: "anon1", filename: "a.csv", source_type: "fortigate", is_demo: true, created_at: saved.created_at, expires_at: saved.expires_at };
    sessionStorage.setItem("sli.recentAnalyses", JSON.stringify([anon]));
    expect(readRecent()).toEqual([]);
    rememberAnalysis(summary);
    expect(readRecent().map((r) => r.id)).toEqual([summary.analysis_id]);
    const stored = JSON.parse(sessionStorage.getItem("sli.recentAnalyses")!);
    expect(stored.map((r: { id: string; owner?: string }) => [r.id, r.owner ?? "anon"])).toEqual([
      [summary.analysis_id, "user:11111111-1111-1111-1111-111111111111"],
      ["anon1", "anon"],
    ]);
  });
});
