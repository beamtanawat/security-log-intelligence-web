import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import evaluationJson from "../../../docs/web/examples/evaluation.json";
import { EvaluationPanel } from "../components/EvaluationPanel";
import { apiError, json, mockFetch } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});


describe("historical evaluation panel", () => {
  it("defaults to preferred_model and shows its real scores, rows and source link", async () => {
    mockFetch({ "GET /api/evaluation": () => json(evaluationJson) });
    render(<EvaluationPanel />);
    const select = await screen.findByLabelText("Model");
    expect(select).toHaveValue("BASE-S2");
    const card = screen.getByLabelText("Scores for BASE-S2");
    expect(within(card).getByText("Accuracy").nextSibling).toHaveTextContent("83.36%");
    expect(within(card).getByText("F1").nextSibling).toHaveTextContent("86.75%");
    expect(screen.getByText("82,332")).toBeInTheDocument();
    expect(screen.getByText("OFFICIAL_TEST_ALL_ROWS")).toBeInTheDocument();
    expect(screen.getByText(/not recorded in the original report/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /source table/i })).toHaveAttribute("href", evaluationJson.models[1].source_table_url);
    expect(screen.getByText(/ไม่ใช่ความแม่นยำของไฟล์ที่อัปโหลด/)).toBeInTheDocument();
  });

  it("switches scores when another model is selected", async () => {
    mockFetch({ "GET /api/evaluation": () => json(evaluationJson) });
    const user = userEvent.setup();
    render(<EvaluationPanel />);
    await user.selectOptions(await screen.findByLabelText("Model"), "BASE-S1");
    const card = screen.getByLabelText("Scores for BASE-S1");
    expect(within(card).getByText("Accuracy").nextSibling).toHaveTextContent("80.97%");
    expect(within(card).getByText("F1").nextSibling).toHaveTextContent("85.11%");
  });

  it("shows unavailable with no fallback numbers on 503, and retry refetches", async () => {
    let n = 0;
    mockFetch({
      "GET /api/evaluation": () =>
        ++n === 1 ? apiError(503, "EVALUATION_UNAVAILABLE", "Evaluation artifacts changed.") : json(evaluationJson),
    });
    const user = userEvent.setup();
    render(<EvaluationPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
    expect(document.body.textContent).not.toMatch(/\d+\.\d{2}%/);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByLabelText("Model")).toHaveValue("BASE-S2");
  });
});
