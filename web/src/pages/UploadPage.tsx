import { useEffect, useState } from "react";
import { api, ApiError, describeError } from "../api/client";
import type { Schema, SourceSchema, SourceType } from "../api/types";
import { AnalysisStatus } from "../components/AnalysisStatus";
import { RecentAnalyses } from "../components/RecentAnalyses";
import { UploadForm } from "../components/UploadForm";
import { useJobPolling } from "../lib/useJobPolling";

interface Props {
  onCompleted: (analysisId: string) => void;
  notice?: string | null;
}

export function UploadPage({ onCompleted, notice }: Props) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [schemaError, setSchemaError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [tracked, setTracked] = useState<{ id: string; statusUrl: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sourceType, setSourceType] = useState<SourceType>("fortigate");
  const poll = useJobPolling(tracked?.statusUrl ?? null, attempt);

  useEffect(() => {
    const ctrl = new AbortController();
    api.schema(ctrl.signal).then((s) => {
      setSchema(s);
      setSourceType(s.source_type); // server default
    }, (e) => {
      if (!(e instanceof DOMException)) setSchemaError(e as ApiError);
    });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (tracked && poll.phase === "completed") onCompleted(tracked.id);
  }, [tracked, poll.phase, onCompleted]);

  const submit = async (start: () => Promise<{ analysis_id: string; status_url: string }>) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const a = await start(); // single attempt: never auto-retried
      setTracked({ id: a.analysis_id, statusUrl: a.status_url });
    } catch (e) {
      setSubmitError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setTracked(null);
    setSubmitError(null);
  };

  const changeSource = (next: SourceType) => {
    reset(); // never mix a previous source's error or job with the new selection
    setSourceType(next);
  };

  // v1 schemas have no `sources`; describe the single legacy FortiGate source from top-level fields.
  const sources: SourceSchema[] = schema?.sources ?? [];
  const selected: SourceSchema | null =
    sources.find((s) => s.source_type === sourceType) ??
    (schema
      ? {
          source_type: schema.source_type,
          name: "FortiGate CSV",
          engine: schema.engine,
          required_columns: schema.required_columns,
          optional_columns: [],
          rules: schema.rules.map((r) => ({ ...r, category: "" })),
          capabilities: { findings: true, records: false, labels: false, timeline: true, network_identifiers: true, ports: true, denied_events: true, model_inference: false, evaluation: false },
        }
      : null);

  const err = submitError ? describeError(submitError) : null;

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md border border-cyan-glow text-[10px] font-semibold text-cyan-glow">
            SLI
          </span>
          Security Log Intelligence
        </p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-[2.5rem] sm:leading-tight">Analyze a security log</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Upload a FortiGate or UNSW-NB15 CSV. Results are leads to investigate, not confirmed attacks.
        </p>
      </header>

      {notice && (
        <p role="status" className="panel border-warn p-4 text-warn">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
      {tracked ? (
        <AnalysisStatus state={poll} onRetryStatus={() => setAttempt((n) => n + 1)} onReset={reset} />
      ) : (
        <>
          {err && (
            <div role="alert" className="panel border-bad p-4">
              <p className="font-semibold text-bad">{err.title}</p>
              <p className="mt-1">{err.detail}</p>
            </div>
          )}
          <UploadForm
            schema={schema}
            sources={sources}
            sourceType={sourceType}
            onSourceChange={changeSource}
            disabled={submitting}
            onUpload={(f) => void submit(() => api.upload(f, sourceType))}
            onDemo={() => void submit(() => api.demo(sourceType))}
          />
        </>
      )}

      <RecentAnalyses currentId={null} onOpen={onCompleted} />
      </div>

      <section className="panel p-5" aria-labelledby="schema-h">
        <h2 id="schema-h" className="panel-title">
          What the file needs
        </h2>
        {schemaError ? (
          <p role="alert" className="mt-2 text-bad">
            {describeError(schemaError).title}: {describeError(schemaError).detail}
          </p>
        ) : !selected ? (
          <p className="mt-2 text-muted">Loading schema…</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              A {selected.name} with all {selected.required_columns.length} required columns in the header. Extra columns are ignored.
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">Required columns ({selected.required_columns.length})</summary>
              <ul className="mono mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
                {selected.required_columns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
            {selected.optional_columns.length > 0 && (
              <p className="mt-3 text-sm">
                Optional: <span className="mono">{selected.optional_columns.join(", ")}</span>
                {selected.source_type === "unsw_nb15" && <span className="text-muted"> (labels are shown, never used by the model)</span>}
              </p>
            )}
            {selected.rules.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold">Detection rules ({selected.rules.length})</summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {selected.rules.map((r) => (
                    <li key={r.rule_id}>
                      {r.name} <span className="badge text-muted">{r.severity}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
      </div>
    </main>
  );
}
