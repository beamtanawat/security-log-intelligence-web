import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";
import { readRecent } from "../lib/recentAnalyses";
import { RecentAnalyses } from "../components/RecentAnalyses";
import { apiError, findingsPage, json, mockFetch, recordsPage, schema, summary, unswSummary } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const routes = {
  "GET /api/schema": () => json(schema),
  "GET /api/evaluation": () => apiError(503, "EVALUATION_UNAVAILABLE", "n/a"),
  [`GET /api/analyses/${summary.analysis_id}/summary`]: () => json(summary),
  [`GET /api/analyses/${summary.analysis_id}/findings?`]: () => json(findingsPage(1, 0)),
  [`GET /api/analyses/${unswSummary.analysis_id}/summary`]: () => json(unswSummary),
  [`GET /api/analyses/${unswSummary.analysis_id}/records?`]: () => json(recordsPage(1, 0)),
};

const dash = (id: string, onOpen = vi.fn()) => (
  <DashboardPage analysisId={id} onNewUpload={() => undefined} onExpired={vi.fn()} onOpenAnalysis={onOpen} />
);

describe("session analysis switcher", () => {
  it("lists previously opened analyses and switches to one", async () => {
    mockFetch(routes);
    const onOpen = vi.fn();
    const { rerender } = render(dash(summary.analysis_id, onOpen));
    await waitFor(() => expect(readRecent()).toHaveLength(1));
    expect(screen.queryByRole("navigation", { name: /analyses in this session/i })).not.toBeInTheDocument();

    rerender(dash(unswSummary.analysis_id, onOpen));
    const nav = await screen.findByRole("navigation", { name: /analyses in this session/i });
    expect(within(nav).getByText("synthetic-unsw_nb15.csv").closest("button")).toHaveAttribute("aria-current", "page");
    const user = userEvent.setup();
    await user.click(within(nav).getByText("synthetic-fortigate.csv").closest("button")!);
    expect(onOpen).toHaveBeenCalledWith(summary.analysis_id);
  });

  it("drops an analysis the server no longer has (404)", async () => {
    sessionStorage.setItem(
      "sli.recentAnalyses",
      JSON.stringify([{ id: "gone", filename: "old.csv", source_type: "fortigate", is_demo: false, created_at: "", expires_at: "" }]),
    );
    mockFetch({ ...routes, "GET /api/analyses/gone/summary": () => apiError(404, "NOT_FOUND", "Not found.") });
    render(dash("gone"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
    expect(readRecent()).toEqual([]);
  });

  it("renders nothing and does not crash when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { container } = render(<RecentAnalyses currentId={null} onOpen={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
