import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";
import { UploadPage } from "../pages/UploadPage";
import type { Summary } from "../api/types";
import { apiError, findingsPage, json, mockFetch, recordsPage, schema, summary, unswRecords, unswSummary, unswUnlabeled } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const accepted = { analysis_id: "abc", state: "queued", status_url: "/api/jobs/abc" };
const running = { analysis_id: "abc", state: "running", stage: null, error: null, expires_at: "2026-10-30T08:34:14Z" };
const csv = (name = "flows.csv") => new File(["a\n1\n"], name, { type: "text/csv" });
const picker = () => screen.getByLabelText(/choose a file/i);

describe("source selection on upload", () => {
  const routes = (extra = {}) => ({
    "GET /api/schema": () => json(schema),
    "POST /api/uploads": () => json(accepted, 202),
    "POST /api/demo": () => json(accepted, 202),
    "GET /api/jobs/abc": () => json(running),
    ...extra,
  });

  it("sends source_type=fortigate by default and unsw_nb15 after choosing UNSW", async () => {
    const { calls } = mockFetch(routes());
    const user = userEvent.setup();
    const { unmount } = render(<UploadPage onCompleted={() => undefined} />);
    await screen.findByRole("radio", { name: /fortigate csv/i });
    await user.upload(picker(), csv());
    await user.click(screen.getByRole("button", { name: /analyze file/i }));
    let body = calls.find((c) => c.method === "POST")!.init!.body as FormData;
    expect(body.get("source_type")).toBe("fortigate");
    unmount();

    calls.length = 0;
    render(<UploadPage onCompleted={() => undefined} />);
    await user.click(await screen.findByRole("radio", { name: /unsw-nb15/i }));
    await user.upload(picker(), csv());
    await user.click(screen.getByRole("button", { name: /analyze file/i }));
    body = calls.find((c) => c.method === "POST")!.init!.body as FormData;
    expect(body.get("source_type")).toBe("unsw_nb15");
    expect(body.get("file")).toBeInstanceOf(File);
    expect(calls.find((c) => c.method === "POST")!.init!.headers).toBeUndefined();
  });

  it("uses the selected source for demo and the sample link, and lists its columns", async () => {
    const { calls } = mockFetch(routes());
    const user = userEvent.setup();
    render(<UploadPage onCompleted={() => undefined} />);
    await user.click(await screen.findByRole("radio", { name: /unsw-nb15/i }));
    expect(screen.getByRole("link", { name: /download sample/i })).toHaveAttribute("href", "/api/sample?source_type=unsw_nb15");
    expect(screen.getByText(/required columns \(28\)/i)).toBeInTheDocument();
    expect(screen.getByText(/id, label, attack_cat/)).toBeInTheDocument();
    expect(screen.getByText(/exceed the size or row limit/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try synthetic/i }));
    expect(calls.find((c) => c.method === "POST")!.url).toBe("/api/demo?source_type=unsw_nb15");
  });

  it("clears the chosen file and the previous error when the source changes", async () => {
    mockFetch(routes({ "POST /api/uploads": () => apiError(422, "MISSING_COLUMNS", "Header is missing dur.") }));
    const user = userEvent.setup();
    render(<UploadPage onCompleted={() => undefined} />);
    await screen.findByRole("radio", { name: /fortigate csv/i });
    await user.upload(picker(), csv());
    await user.click(screen.getByRole("button", { name: /analyze file/i }));
    expect(await screen.findByText("Header is missing dur.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /unsw-nb15/i }));
    expect(screen.queryByText("Header is missing dur.")).not.toBeInTheDocument();
    expect(screen.queryByText(/selected:/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze file/i })).toBeDisabled();
  });
});

describe("UNSW-NB15 dashboard", () => {
  const routes = (s: Summary, extra = {}) => ({
    "GET /api/schema": () => json(schema),
    [`GET /api/analyses/${s.analysis_id}/summary`]: () => json(s),
    [`GET /api/analyses/${s.analysis_id}/records?`]: (url: string) => {
      const p = new URL(url, "http://x").searchParams;
      return json(recordsPage(60, Number(p.get("offset")), Number(p.get("limit"))));
    },
    ...extra,
  });
  const renderDash = (s: Summary) =>
    render(<DashboardPage analysisId={s.analysis_id} onNewUpload={() => undefined} onExpired={vi.fn()} onOpenAnalysis={() => undefined} />);

  it("shows uploaded labels as annotations, hides unsupported panels and invents no metrics", async () => {
    const { calls } = mockFetch(routes(unswSummary));
    renderDash(unswSummary);
    expect(await screen.findByText("synthetic-unsw_nb15.csv")).toBeInTheDocument();
    expect(screen.getByText("UNSW-NB15 prepared CSV")).toBeInTheDocument();
    expect(screen.getByText(/not confirmed attacks/i)).toBeInTheDocument();

    const labels = screen.getByRole("region", { name: /uploaded labels/i });
    expect(within(labels).getByText(/not predictions by this system/i)).toBeInTheDocument();
    expect(within(labels).getByText("Labeled").nextSibling).toHaveTextContent("12");

    const cards = screen.getByRole("region", { name: /key counts/i });
    expect(within(cards).queryByText("Denied events")).not.toBeInTheDocument();
    expect(within(cards).queryByText("Rule findings")).not.toBeInTheDocument();
    expect(screen.queryByText(/events over time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/top source identifiers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/top destination ports/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^findings$/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/accuracy\s*[:=]|F1\s*[:=]|risk score\s*[:=]|probability\s*[:=]/i);
    expect(calls.some((c) => c.url.includes("/findings"))).toBe(false);

    const table = await screen.findByRole("region", { name: /flow records table/i });
    expect(within(table).getByText("label (file)")).toBeInTheDocument();
    expect(within(table).getAllByText("ATTACK").length).toBeGreaterThan(0);
  });

  it("unlabeled file: no label distribution and no label columns", async () => {
    mockFetch(routes(unswUnlabeled));
    renderDash(unswUnlabeled);
    expect(await screen.findByText(/no usable label column/i)).toBeInTheDocument();
    const table = await screen.findByRole("region", { name: /flow records table/i });
    expect(within(table).queryByText("label (file)")).not.toBeInTheDocument();
    expect(screen.queryByText(/binary label \(from file\)/i)).not.toBeInTheDocument();
  });

  it("renders null numeric statistics as 'no data', never as 0", async () => {
    const withNull: Summary = {
      ...unswSummary,
      numeric_stats: [{ field: "sjit", count: 0, missing: 12, invalid: 0, min: null, max: null, mean: null }],
    };
    mockFetch(routes(withNull));
    renderDash(withNull);
    await userEvent.setup().click(await screen.findByRole("tab", { name: /overview/i }));
    const stats = await screen.findByRole("region", { name: /numeric feature statistics/i });
    const row = within(stats).getByText("sjit").closest("tr")!;
    expect(within(row).getAllByText("no data")).toHaveLength(3);
  });

  it("paginates flow records via /records", async () => {
    const { calls } = mockFetch(routes(unswSummary));
    const user = userEvent.setup();
    renderDash(unswSummary);
    await screen.findByText(/1–25 of 60/);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText(/26–50 of 60/);
    const last = calls.filter((c) => c.url.includes("/records?")).at(-1)!;
    expect(new URL(last.url, "http://x").searchParams.get("offset")).toBe("25");
  });

  it("record drawer separates features from the uploaded annotation and traps focus", async () => {
    mockFetch(routes(unswSummary, { [`GET /api/analyses/${unswSummary.analysis_id}/records?`]: () => json(unswRecords) }));
    const user = userEvent.setup();
    renderDash(unswSummary);
    const opener = (await screen.findAllByText("All features"))[0].closest("button")!;
    await user.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/uploaded annotation \(not a prediction\)/i)).toBeInTheDocument();
    expect(within(dialog).getByText("dur")).toBeInTheDocument();
    const close = within(dialog).getByRole("button", { name: /close/i });
    expect(close).toHaveFocus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});

describe("FortiGate compatibility", () => {
  it("a v1 summary without capabilities still renders the FortiGate panels", async () => {
    const v1 = { ...summary } as Partial<Summary>;
    delete v1.capabilities;
    delete v1.source_type;
    mockFetch({
      "GET /api/schema": () => json(schema),
      [`GET /api/analyses/${summary.analysis_id}/summary`]: () => json(v1),
      [`GET /api/analyses/${summary.analysis_id}/findings?`]: () => json(findingsPage(3, 0)),
    });
    render(<DashboardPage analysisId={summary.analysis_id} onNewUpload={() => undefined} onExpired={vi.fn()} onOpenAnalysis={() => undefined} />);
    expect(await screen.findByText(/events over time/i)).toBeInTheDocument();
    expect(screen.getByText("Denied events")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /export csv/i })).toBeInTheDocument();
    expect(screen.queryByText(/flow records/i)).not.toBeInTheDocument();
  });
});
