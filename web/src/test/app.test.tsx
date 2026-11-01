import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { json, mockFetch, schema } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("app routing without staging auth", () => {
  it("sends #/history back to upload and hides account controls when auth is not configured", async () => {
    mockFetch({ "GET /api/schema": () => json(schema) });
    window.location.hash = "#/history";
    render(<App />);
    expect(await screen.findByText(/saved history is not available on this site/i)).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });
});
