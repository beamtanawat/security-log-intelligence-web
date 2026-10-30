import type { ApiError } from "../api/client";
import { describeError } from "../api/client";
import type { PollState } from "../lib/useJobPolling";

const STAGE_LABEL: Record<string, string> = {
  validating: "Validating CSV structure",
  normalizing: "Normalizing records and applying rules",
  detecting: "Applying rules",
  summarizing: "Building summary",
};

interface Props {
  state: PollState;
  onRetryStatus: () => void;
  onReset: () => void;
}

export function AnalysisStatus({ state, onRetryStatus, onReset }: Props) {
  if (state.phase === "polling") {
    const job = state.job;
    return (
      <section className="panel p-5" role="status" aria-live="polite">
        <h2 className="panel-title">Analysis in progress</h2>
        <p className="mt-2 text-lg">{job?.stage ? STAGE_LABEL[job.stage] : job?.state === "running" ? "Running" : "Queued"}…</p>
        <p className="text-sm text-muted">Checking status about once per second. Progress percentage is not reported by the server.</p>
      </section>
    );
  }
  if (state.phase === "completed") {
    return (
      <section className="panel p-5" role="status">
        <p>Analysis complete. Opening dashboard…</p>
      </section>
    );
  }
  if (state.phase === "failed") {
    const err = state.job.error;
    return (
      <section className="panel border-bad p-5" role="alert">
        <h2 className="text-lg font-semibold text-bad">Analysis failed</h2>
        <p className="mt-2">{err?.message ?? "The file could not be analyzed."}</p>
        {err?.code && <p className="mono mt-1 text-muted">{err.code}</p>}
        <p className="mt-2 text-sm text-muted">Nothing was analyzed. Fix the file and upload again.</p>
        <button type="button" className="btn btn-primary mt-4" onClick={onReset}>
          Back to upload
        </button>
      </section>
    );
  }
  if (state.phase === "expired") {
    return (
      <section className="panel p-5" role="alert">
        <h2 className="text-lg font-semibold text-warn">Analysis expired</h2>
        <p className="mt-2">Results are kept for at most 60 minutes and are lost if the server restarts. Upload the file again.</p>
        <button type="button" className="btn btn-primary mt-4" onClick={onReset}>
          Back to upload
        </button>
      </section>
    );
  }
  const e: ApiError = state.error;
  const d = describeError(e);
  return (
    <section className="panel p-5" role="alert">
      <h2 className="text-lg font-semibold text-bad">{d.title}</h2>
      <p className="mt-2">{d.detail}</p>
      <p className="mt-2 text-sm text-muted">The file was already submitted. Checking status again will not upload it a second time.</p>
      <div className="mt-4 flex gap-3">
        <button type="button" className="btn btn-primary" onClick={onRetryStatus}>
          Check status again
        </button>
        <button type="button" className="btn" onClick={onReset}>
          Back to upload
        </button>
      </div>
    </section>
  );
}
