import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Job } from "../api/types";

export const POLL_INTERVAL_MS = 1000;

export type PollState =
  | { phase: "polling"; job: Job | null }
  | { phase: "completed"; job: Job }
  | { phase: "failed"; job: Job }
  | { phase: "expired" }
  | { phase: "error"; error: ApiError };

/**
 * Polls the server-provided status_url about once per second.
 * Stops on completed/failed/expired, on a request error (user can retry), and on unmount.
 * `attempt` lets the caller restart polling after an error without re-submitting the upload.
 */
export function useJobPolling(statusUrl: string | null, attempt = 0): PollState {
  const [state, setState] = useState<PollState>({ phase: "polling", job: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!statusUrl) return;
    const ctrl = new AbortController();
    let stopped = false;
    setState({ phase: "polling", job: null });

    const tick = async () => {
      try {
        const job = await api.job(statusUrl, ctrl.signal);
        if (stopped) return;
        if (job.state === "completed") return setState({ phase: "completed", job });
        if (job.state === "failed") return setState({ phase: "failed", job });
        if (job.state === "expired") return setState({ phase: "expired" });
        setState({ phase: "polling", job });
        timer.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e) {
        if (stopped || (e instanceof DOMException && e.name === "AbortError")) return;
        if (e instanceof ApiError && e.kind === "expired") return setState({ phase: "expired" });
        setState({ phase: "error", error: e instanceof ApiError ? e : new ApiError("unknown", "Status check failed.") });
      }
    };
    void tick();

    return () => {
      stopped = true;
      ctrl.abort();
      clearTimeout(timer.current);
    };
  }, [statusUrl, attempt]);

  return state;
}
