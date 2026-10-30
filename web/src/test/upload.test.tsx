import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadPage } from "../pages/UploadPage";
import { POLL_INTERVAL_MS } from "../lib/useJobPolling";
import { apiError, json, mockFetch, schema } from "./helpers";

const accepted = { analysis_id: "abc", state: "queued", status_url: "/api/jobs/abc" };
const job = (state: string, over: object = {}) => ({
  analysis_id: "abc", state, stage: null, error: null, expires_at: "2026-10-30T08:34:14Z", ...over,
});
const csv = (name = "log.csv") => new File(["a,b\n1,2\n"], name, { type: "text/csv" });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("upload flow", () => {
  it("shows a 422 error, does not auto-retry, and lets the user fix and resubmit", async () => {
    let post = 0;
    const { calls } = mockFetch({
      "GET /api/schema": () => json(schema),
      "POST /api/uploads": () => (++post === 1 ? apiError(422, "BAD_CSV", "Header row is malformed.") : json(accepted, 202)),
      "GET /api/jobs/abc": () => json(job("running", { stage: "detecting" })),
    });
    const user = userEvent.setup();
    render(<UploadPage onCompleted={() => undefined} />);

    await user.upload(screen.getByLabelText(/choose a file/i), csv("bad.csv"));
    await user.click(screen.getByRole("button", { name: /analyze file/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Header row is malformed.");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);

    // form is usable again; second, user-initiated submit succeeds
    await user.upload(screen.getByLabelText(/choose a file/i), csv("good.csv"));
    await user.click(screen.getByRole("button", { name: /analyze file/i }));
    expect(await screen.findByText(/analysis in progress/i)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("sends multipart FormData field 'file' without a manual Content-Type", async () => {
    const { calls } = mockFetch({
      "GET /api/schema": () => json(schema),
      "POST /api/uploads": () => json(accepted, 202),
      "GET /api/jobs/abc": () => json(job("running")),
    });
    const user = userEvent.setup();
    render(<UploadPage onCompleted={() => undefined} />);
    await user.upload(screen.getByLabelText(/choose a file/i), csv());
    await user.click(screen.getByRole("button", { name: /analyze file/i }));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.init?.body).toBeInstanceOf(FormData);
    expect((post.init!.body as FormData).get("file")).toBeInstanceOf(File);
    expect(post.init?.headers).toBeUndefined();
  });

  it("rejects non-.csv files before sending anything", async () => {
    const { calls } = mockFetch({ "GET /api/schema": () => json(schema) });
    render(<UploadPage onCompleted={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/choose a file/i), { target: { files: [new File(["x"], "log.txt")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/only \.csv/i);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(screen.getByRole("button", { name: /analyze file/i })).toBeDisabled();
  });

  it("polls status_url until completed, reports it, then stops polling", async () => {
    vi.useFakeTimers();
    const states = ["queued", "running", "completed"];
    let i = 0;
    const { calls } = mockFetch({
      "GET /api/schema": () => json(schema),
      "POST /api/demo": () => json(accepted, 202),
      "GET /api/jobs/abc": () => json(job(states[Math.min(i++, 2)])),
    });
    const onCompleted = vi.fn();
    render(<UploadPage onCompleted={onCompleted} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try synthetic/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(onCompleted).toHaveBeenCalledWith("abc");
    const jobCalls = () => calls.filter((c) => c.url === "/api/jobs/abc").length;
    expect(jobCalls()).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    });
    expect(jobCalls()).toBe(3); // stopped
  });

  it("stops polling when the page unmounts", async () => {
    vi.useFakeTimers();
    const { calls } = mockFetch({
      "GET /api/schema": () => json(schema),
      "POST /api/demo": () => json(accepted, 202),
      "GET /api/jobs/abc": () => json(job("running")),
    });
    const { unmount } = render(<UploadPage onCompleted={() => undefined} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try synthetic/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    });
    const n = calls.filter((c) => c.url === "/api/jobs/abc").length;
    unmount();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    expect(calls.filter((c) => c.url === "/api/jobs/abc").length).toBe(n);
  });

  it("expired job (HTTP 410) offers a way back to upload", async () => {
    mockFetch({
      "GET /api/schema": () => json(schema),
      "POST /api/demo": () => json(accepted, 202),
      "GET /api/jobs/abc": () => apiError(410, "EXPIRED", "gone"),
    });
    const user = userEvent.setup();
    render(<UploadPage onCompleted={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /try synthetic/i }));
    expect(await screen.findByText(/analysis expired/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back to upload/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /analyze file/i })).toBeInTheDocument());
  });

  it("shows a failed job's server error and returns to upload", async () => {
    mockFetch({
      "GET /api/schema": () => json(schema),
      "POST /api/uploads": () => json(accepted, 202),
      "GET /api/jobs/abc": () =>
        json(job("failed", { error: { code: "MISSING_BASELINE_FIELDS", message: "CSV header is missing required fields", fields: [] } })),
    });
    const user = userEvent.setup();
    render(<UploadPage onCompleted={() => undefined} />);
    await user.upload(screen.getByLabelText(/choose a file/i), csv());
    await user.click(screen.getByRole("button", { name: /analyze file/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("CSV header is missing required fields");
    await user.click(screen.getByRole("button", { name: /back to upload/i }));
    expect(screen.getByRole("button", { name: /analyze file/i })).toBeInTheDocument();
  });

  it("describes a network failure without creating a fake result", async () => {
    mockFetch({
      "GET /api/schema": () => json(schema),
      "POST /api/demo": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const user = userEvent.setup();
    render(<UploadPage onCompleted={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /try synthetic/i }));
    expect(await screen.findByText(/service unreachable/i)).toBeInTheDocument();
  });
});

beforeEach(() => {
  window.location.hash = "";
});
