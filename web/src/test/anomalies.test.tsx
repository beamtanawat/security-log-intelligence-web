import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";
import type { AnomaliesPage, AnomalyInference, Summary } from "../api/types";
import { ANOMALY_DISCLAIMER, sortPageByScore } from "../components/AnomaliesPanel";
import { apiError, findingsPage, json, mockFetch, schema, summary, unswSummary } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// TEST-ONLY: copies of docs/web/examples/anomaly-*.json (synthetic shapes, not measured scores).
const anomalyInference: AnomalyInference = {
  available: true,
  model: {
    model_id: "FORTIGATE-STAGE-1.8",
    family: "ISOLATION_FOREST",
    artifact_sha256: "5e072b4e89b864eba854f70239fd3c2647a1d78468adb733ebc0a8f54e07bc53",
    training_dataset: "FortiGate reference partition",
    trained_at: null,
  },
  scored_records: 1,
  unscored_records: 1,
  score_semantics: "negative_score_samples_higher_is_more_abnormal",
  reference_percentile_semantics: "percent_of_frozen_reference_scores_at_or_below_score",
  disclaimer: ANOMALY_DISCLAIMER,
};
const anomalyPage: AnomaliesPage = {
  items: [
    { source_record_number: 1, status: "scored", raw_abnormality: 0.5, reference_percentile: 75.0, error_code: null },
    { source_record_number: 2, status: "unscored", raw_abnormality: null, reference_percentile: null, error_code: "INVALID_ANOMALY_FEATURE" },
  ],
  total: 2,
  offset: 0,
  limit: 50,
};

const withAnomalies: Summary = {
  ...summary,
  capabilities: { ...summary.capabilities!, anomalies: true },
  anomaly_inference: anomalyInference,
};

const routes = (s: Summary, extra = {}) => ({
  "GET /api/schema": () => json(schema),
  [`GET /api/analyses/${s.analysis_id}/summary`]: () => json(s),
  [`GET /api/analyses/${s.analysis_id}/findings?`]: () => json(findingsPage(3, 0)),
  ...extra,
});

const renderDash = (s: Summary) =>
  render(<DashboardPage analysisId={s.analysis_id} onNewUpload={() => undefined} onExpired={vi.fn()} onOpenAnalysis={() => undefined} />);

describe("FortiGate anomaly scores panel", () => {
  it("shows scores next to rule findings with the disclaimer and no attack label", async () => {
    const { calls } = mockFetch(
      routes(withAnomalies, { [`GET /api/analyses/${withAnomalies.analysis_id}/anomalies?`]: () => json(anomalyPage) }),
    );
    renderDash(withAnomalies);
    const panel = (await screen.findByRole("heading", { name: /anomaly scores \(isolation forest\)/i })).closest("section")!;
    expect(within(panel).getByText(ANOMALY_DISCLAIMER)).toBeInTheDocument();
    expect(within(panel).getByText("not recorded")).toBeInTheDocument();

    const rows = within(await within(panel).findByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByText("75.0")).toBeInTheDocument();
    expect(within(rows[1]).getByText("0.5000")).toBeInTheDocument();
    expect(within(rows[2]).getByText("not scored")).toBeInTheDocument();
    expect(within(rows[2]).getByText("INVALID_ANOMALY_FEATURE")).toBeInTheDocument();
    expect(within(panel).queryByText(/attack(?!\s*(label|probability))/i)).toBeNull();

    // Rule findings remain on the page as their own panel.
    expect(screen.getByRole("heading", { name: /^findings$/i })).toBeInTheDocument();
    expect(screen.getByText(/no attack predictions\./i)).toBeInTheDocument();
    expect(screen.queryByText(/no ai model predictions/i)).not.toBeInTheDocument();
    expect(calls.find((c) => c.url.includes("/anomalies?"))!.url).toContain("offset=0&limit=25");
  });

  it("sorts only the loaded page when asked, and says so", async () => {
    const page: AnomaliesPage = {
      ...anomalyPage,
      items: [
        { source_record_number: 1, status: "scored", raw_abnormality: 0.4, reference_percentile: 20, error_code: null },
        { source_record_number: 2, status: "unscored", raw_abnormality: null, reference_percentile: null, error_code: "INVALID_ANOMALY_FEATURE" },
        { source_record_number: 3, status: "scored", raw_abnormality: 0.6, reference_percentile: 99.5, error_code: null },
      ],
      total: 3,
    };
    mockFetch(routes(withAnomalies, { [`GET /api/analyses/${withAnomalies.analysis_id}/anomalies?`]: () => json(page) }));
    const user = userEvent.setup();
    renderDash(withAnomalies);
    const panel = (await screen.findByRole("heading", { name: /anomaly scores/i })).closest("section")!;
    const firstCells = () => within(within(panel).getByRole("table")).getAllByRole("row").slice(1).map((r) => (r as HTMLTableRowElement).cells[0].textContent);
    await within(panel).findByRole("table");
    expect(firstCells()).toEqual(["#1", "#2", "#3"]);
    await user.click(within(panel).getByRole("radio", { name: /highest score on this page/i }));
    expect(firstCells()).toEqual(["#3", "#1", "#2"]);
    expect(within(panel).getByText(/not a ranking across the whole file/i)).toBeInTheDocument();
  });

  it("orders ties by raw score and keeps unscored rows last", () => {
    const sorted = sortPageByScore([
      { source_record_number: 1, status: "unscored", raw_abnormality: null, reference_percentile: null, error_code: "X" },
      { source_record_number: 2, status: "scored", raw_abnormality: 0.1, reference_percentile: 50, error_code: null },
      { source_record_number: 3, status: "scored", raw_abnormality: 0.3, reference_percentile: 50, error_code: null },
    ]);
    expect(sorted.map((s) => s.source_record_number)).toEqual([3, 2, 1]);
  });

  it("shows the server error and no scores when the model is unavailable", async () => {
    mockFetch(
      routes(withAnomalies, {
        [`GET /api/analyses/${withAnomalies.analysis_id}/anomalies?`]: () =>
          apiError(503, "MODEL_INTEGRITY_FAILED", "Model integrity verification failed."),
      }),
    );
    renderDash(withAnomalies);
    const alert = await screen.findByText(/anomaly scores unavailable/i);
    expect(alert).toHaveTextContent("MODEL_INTEGRITY_FAILED");
    expect(alert).toHaveTextContent("No scores are shown.");
    expect(screen.queryByText("75.0")).not.toBeInTheDocument();
  });

  it("explains an unavailable model reported in the summary and requests nothing", async () => {
    const failed: Summary = {
      ...summary,
      anomaly_inference: { available: false, reason: "The anomaly model is not configured.", error_code: "MODEL_NOT_CONFIGURED" },
    };
    const { calls } = mockFetch(routes(failed));
    renderDash(failed);
    const note = (await screen.findByText(/anomaly scores unavailable/i)).closest("p")!;
    expect(note).toHaveTextContent("MODEL_NOT_CONFIGURED");
    expect(screen.queryByRole("heading", { name: /anomaly scores/i })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/anomalies"))).toBe(false);
  });

  it("never shows anomaly scores for UNSW-NB15, even if flags are set", async () => {
    const unsw: Summary = {
      ...unswSummary,
      capabilities: { ...unswSummary.capabilities!, anomalies: true },
      anomaly_inference: anomalyInference,
    };
    const { calls } = mockFetch({
      "GET /api/schema": () => json(schema),
      [`GET /api/analyses/${unsw.analysis_id}/summary`]: () => json(unsw),
      [`GET /api/analyses/${unsw.analysis_id}/records?`]: () => json({ items: [], total: 0, offset: 0, limit: 25 }),
    });
    renderDash(unsw);
    expect(await screen.findByText(unsw.filename)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /anomaly scores/i })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/anomalies"))).toBe(false);
  });
});
