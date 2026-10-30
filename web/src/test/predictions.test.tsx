import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";
import type { Summary } from "../api/types";
import { PREDICTION_DISCLAIMER } from "../components/PredictionsPanel";
import { apiError, json, mockFetch, predictionInference, predictionPage, recordsPage, schema, summary, unswSummary } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// TEST-ONLY: the v1.2 draft examples are synthetic shapes, not real inference results.
const withPredictions: Summary = {
  ...unswSummary,
  capabilities: { ...unswSummary.capabilities!, model_inference: true, predictions: true },
  inference: predictionInference,
};

const routes = (s: Summary, extra = {}) => ({
  "GET /api/schema": () => json(schema),
  [`GET /api/analyses/${s.analysis_id}/summary`]: () => json(s),
  [`GET /api/analyses/${s.analysis_id}/records?`]: () => json(recordsPage(2, 0)),
  ...extra,
});

const renderDash = (s: Summary) =>
  render(<DashboardPage analysisId={s.analysis_id} onNewUpload={() => undefined} onExpired={vi.fn()} onOpenAnalysis={() => undefined} />);

describe("model predictions panel (v1.2 draft)", () => {
  it("shows scored and unscored rows with the disclaimer and no file accuracy", async () => {
    const { calls } = mockFetch(
      routes(withPredictions, { [`GET /api/analyses/${withPredictions.analysis_id}/predictions?`]: () => json(predictionPage) }),
    );
    renderDash(withPredictions);
    const panel = (await screen.findByRole("heading", { name: /model predictions \(BASE-S2\)/i })).closest("section")!;
    expect(within(panel).getByText(PREDICTION_DISCLAIMER)).toBeInTheDocument();
    expect(within(panel).getByText("not evaluated for this file")).toBeInTheDocument();
    expect(within(panel).getByText("not recorded")).toBeInTheDocument();

    const table = await within(panel).findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("ATTACK")).toBeInTheDocument();
    expect(within(rows[1]).getByText("0.720")).toBeInTheDocument();
    expect(within(rows[2]).getByText("not scored")).toBeInTheDocument();
    expect(within(rows[2]).getByText("INVALID_PREDICTIVE_FEATURE")).toBeInTheDocument();

    expect(screen.queryByText(/no ai model predictions/i)).not.toBeInTheDocument();
    expect(calls.find((c) => c.url.includes("/predictions?"))!.url).toContain("offset=0&limit=25");
  });

  it("shows the server error and no predictions when the model is unavailable", async () => {
    mockFetch(
      routes(withPredictions, {
        [`GET /api/analyses/${withPredictions.analysis_id}/predictions?`]: () =>
          apiError(503, "MODEL_NOT_CONFIGURED", "The prediction model is not configured."),
      }),
    );
    renderDash(withPredictions);
    const alert = await screen.findByText(/predictions unavailable/i);
    expect(alert).toHaveTextContent("MODEL_NOT_CONFIGURED");
    expect(alert).toHaveTextContent("No predictions are shown.");
    expect(screen.queryByRole("table", { name: /model predictions/i })).not.toBeInTheDocument();
    expect(screen.queryByText("0.720")).not.toBeInTheDocument();
  });

  it("does not request predictions when the summary does not offer them", async () => {
    const { calls } = mockFetch(routes(unswSummary));
    renderDash(unswSummary);
    expect(await screen.findByText(/no ai model predictions/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /model predictions/i })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/predictions"))).toBe(false);
  });

  it("never shows an S2 panel for FortiGate, even if flags are set", async () => {
    const forti: Summary = {
      ...summary,
      capabilities: { ...withPredictions.capabilities!, findings: true },
      inference: predictionInference,
    };
    const { calls } = mockFetch({
      "GET /api/schema": () => json(schema),
      [`GET /api/analyses/${forti.analysis_id}/summary`]: () => json(forti),
      [`GET /api/analyses/${forti.analysis_id}/findings?`]: () => json({ items: [], total: 0, offset: 0, limit: 25 }),
      [`GET /api/analyses/${forti.analysis_id}/records?`]: () => json(recordsPage(0, 0)),
    });
    renderDash(forti);
    expect(await screen.findByText(forti.filename)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /model predictions/i })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/predictions"))).toBe(false);
  });

  it("explains an unavailable model reported in the summary", async () => {
    const failed: Summary = {
      ...unswSummary,
      inference: { available: false, reason: "Model integrity check failed.", error_code: "MODEL_INTEGRITY_FAILED" },
    };
    mockFetch(routes(failed));
    renderDash(failed);
    const note = await screen.findByText(/model predictions unavailable/i);
    expect(note.closest("p")).toHaveTextContent("MODEL_INTEGRITY_FAILED");
    expect(note.closest("p")).toHaveTextContent("Model integrity check failed.");
  });
});
