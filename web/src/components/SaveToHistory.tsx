import { useState } from "react";
import { api, describeError } from "../api/client";

/**
 * Snapshots the current (signed-in) temporary analysis into the account's saved history.
 * Shown only while signed in; the backend rejects jobs that were not created in this signed-in session.
 */
export function SaveToHistory({ analysisId }: { analysisId: string }) {
  const [state, setState] = useState<{ phase: "idle" | "saving" | "saved" | "error"; text?: string }>({ phase: "idle" });

  const save = async () => {
    setState({ phase: "saving" });
    try {
      const r = await api.workspace.save(analysisId);
      setState({ phase: "saved", text: r.created ? "Saved for 7 days" : "Already saved" });
    } catch (e) {
      const err = e as { code?: string | null };
      const d = describeError(e);
      const text =
        err.code === "WORKSPACE_CAPACITY"
          ? "History is full (20 saved). Delete an older analysis first."
          : err.code === "WORKSPACE_ITEM_LIMIT" || err.code === "WORKSPACE_SIZE_LIMIT"
            ? "This analysis is too large to save."
            : d.detail;
      setState({ phase: "error", text: `Not saved. ${text}` });
    }
  };

  if (state.phase === "saved") {
    return (
      <span role="status" className="flex items-center gap-2 text-sm text-ok">
        {state.text}
        <a className="btn" href={`#/history/${encodeURIComponent(analysisId)}`}>
          Open saved copy
        </a>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn"
        disabled={state.phase === "saving"}
        onClick={save}
        title="Saves derived results (not your CSV) to your account for 7 days"
      >
        {state.phase === "saving" ? "Saving…" : "Save to history"}
      </button>
      {state.phase === "error" && (
        <span role="alert" className="max-w-xs text-xs text-bad">
          {state.text}
        </span>
      )}
    </span>
  );
}
