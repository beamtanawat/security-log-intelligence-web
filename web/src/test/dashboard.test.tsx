import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";
import { apiError, finding, findingsPage, json, mockFetch, schema, summary } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base = `/api/analyses/${summary.analysis_id}`;
const routes = (extra: Record<string, (url: string) => Response> = {}) => ({
  "GET /api/schema": () => json(schema),
  [`GET ${base}/summary`]: () => json(summary),
  [`GET ${base}/findings/`]: () => json(finding),
  [`GET ${base}/findings?`]: (url: string) => {
    const p = new URL(url, "http://x").searchParams;
    return json(findingsPage(60, Number(p.get("offset")), Number(p.get("limit"))));
  },
  ...extra,
});

const renderDash = (onExpired = vi.fn()) =>
  render(<DashboardPage analysisId={summary.analysis_id} onNewUpload={() => undefined} onExpired={onExpired} onOpenAnalysis={() => undefined} />);

describe("dashboard", () => {
  it("renders real counts, demo badge, time assumption and rules-based summary", async () => {
    mockFetch(routes());
    renderDash();
    expect(await screen.findByText("synthetic-fortigate.csv")).toBeInTheDocument();
    expect(screen.getByText(/DEMO · synthetic data/)).toBeInTheDocument();
    expect(screen.getByText("FortiGate CSV")).toBeInTheDocument();
    const cards = screen.getByRole("region", { name: /key counts/i });
    expect(within(cards).getByText("Denied events").nextSibling).toHaveTextContent("6");
    expect(within(cards).getByText("Rule findings").nextSibling).toHaveTextContent("7");
    expect(screen.getAllByText(/unix epoch seconds/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText(/not confirmed attacks/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("switches views with tabs and arrow keys, showing one view at a time", async () => {
    mockFetch(routes());
    const user = userEvent.setup();
    renderDash();
    const findingsTab = await screen.findByRole("tab", { name: /^findings/i });
    expect(findingsTab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("region", { name: /findings table/i })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /overview/i }));
    expect(screen.queryByRole("region", { name: /findings table/i })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /overview/i })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    expect(findingsTab).toHaveAttribute("aria-selected", "true");
    expect(findingsTab).toHaveFocus();
  });

  it("renders null event times as Unknown, never as an invented date", async () => {
    mockFetch(
      routes({
        [`GET ${base}/findings?`]: () =>
          json(findingsPage(1, 0, 25, { event_time: null, time_status: "UNAVAILABLE" })),
      }),
    );
    renderDash();
    const table = await screen.findByRole("region", { name: /findings table/i });
    expect(within(table).getByText("Unknown")).toBeInTheDocument();
    expect(table.textContent).not.toMatch(/1970|Invalid Date|NaN/);
  });

  it("resets to the first page when a filter changes and sends the filter", async () => {
    const { calls } = mockFetch(routes());
    const user = userEvent.setup();
    renderDash();
    await screen.findByText(/1–25 of 60/);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText(/26–50 of 60/);
    await user.selectOptions(screen.getByLabelText("Severity"), "INFORMATIONAL");
    await screen.findByText(/1–25 of 60/);
    const last = calls.filter((c) => c.url.includes("/findings?")).at(-1)!;
    const p = new URL(last.url, "http://x").searchParams;
    expect(p.get("offset")).toBe("0");
    expect(p.get("severity")).toBe("INFORMATIONAL");
    // exports carry the same filter
    const href = screen.getByRole("link", { name: /export csv/i }).getAttribute("href")!;
    expect(href).toContain("format=csv");
    expect(href).toContain("severity=INFORMATIONAL");
  });

  it("opens the evidence drawer and closes it with Escape", async () => {
    mockFetch(routes());
    const user = userEvent.setup();
    renderDash();
    await user.click((await screen.findAllByText("Details"))[0].closest("button")!);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(finding.reason)).toBeInTheDocument();
    expect(within(dialog).getByText("event.action_source")).toBeInTheDocument();
    expect(within(dialog).getByText(finding.false_positive_note)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renders HTML-looking evidence as inert text", async () => {
    const evil = { ...finding, evidence: [{ ...finding.evidence[0], value: "<img src=x onerror=alert(1)>" }] };
    mockFetch(routes({ [`GET ${base}/findings/`]: () => json(evil) }));
    const user = userEvent.setup();
    renderDash();
    await user.click((await screen.findAllByText("Details"))[0].closest("button")!);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("<img src=x onerror=alert(1)>");
    expect(dialog.querySelector("img")).toBeNull();
  });

  it("sends the user back to upload when the analysis has expired (410)", async () => {
    mockFetch(routes({ [`GET ${base}/summary`]: () => apiError(410, "EXPIRED", "expired") }));
    const onExpired = vi.fn();
    renderDash(onExpired);
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });

  it("shows an error, not a fake dashboard, when the backend fails", async () => {
    mockFetch(routes({ [`GET ${base}/summary`]: () => apiError(409, "NOT_READY", "Analysis is not completed.") }));
    renderDash();
    expect(await screen.findByRole("alert")).toHaveTextContent(/not ready/i);
    expect(screen.queryByText("synthetic-fortigate.csv")).not.toBeInTheDocument();
  });
});
