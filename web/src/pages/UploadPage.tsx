import { useEffect, useState } from "react";
import { api, ApiError, describeError } from "../api/client";
import type { Schema, SourceSchema, SourceType } from "../api/types";
import { AnalysisStatus } from "../components/AnalysisStatus";
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
    <main id="main" tabIndex={-1} className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header>
        <p className="panel-title">Security Log Intelligence</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Inspect a security log export</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Choose a supported source and upload a CSV that matches its schema. FortiGate exports are normalized and checked with a small
          set of transparent rules; UNSW-NB15 flow files are profiled statistically. A rule match, an anomaly label or a deny event is
          evidence to review, not a confirmed attack. No AI model makes predictions in this release.
        </p>
      </header>

      {notice && (
        <p role="status" className="panel border-warn p-4 text-warn">
          {notice}
        </p>
      )}

      {tracked ? (
        <AnalysisStatus state={poll} onRetryStatus={() => setAttempt((n) => n + 1)} onReset={reset} />
      ) : (
        <>
          {err && (
            <div role="alert" className="panel border-bad p-4">
              <p className="font-semibold text-bad">{err.title}</p>
              <p className="mt-1">{err.detail}</p>
              <p className="mt-1 text-sm text-muted">Nothing was retried automatically. Adjust the file if needed and submit again.</p>
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

      <section className="panel p-5" aria-labelledby="schema-h">
        <h2 id="schema-h" className="panel-title">
          Supported schema
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
              Source: {selected.name}. Engine: {selected.engine}. The header must contain all {selected.required_columns.length} required
              columns below; extra columns are preserved but not analyzed.
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Required columns ({selected.required_columns.length})</summary>
              <ul className="mono mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
                {selected.required_columns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
            {selected.optional_columns.length > 0 && (
              <p className="mt-3 text-sm">
                Optional: <span className="mono">{selected.optional_columns.join(", ")}</span>
                {selected.source_type === "unsw_nb15" && (
                  <span className="text-muted"> — label/attack_cat are shown as uploaded annotations, never used as features.</span>
                )}
              </p>
            )}
            <h3 className="mt-4 text-sm font-semibold">Active rules</h3>
            {selected.rules.length === 0 ? (
              <p className="mt-1 text-sm text-muted">None. This source is profiled only; no detector findings are produced.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {selected.rules.map((r) => (
                  <li key={r.rule_id}>
                    {r.name} <span className="mono text-muted">({r.rule_id})</span> <span className="badge text-muted">{r.severity}</span>
                    {r.category && <span className="mono ml-2 text-xs text-muted">category: {r.category}</span>}
                  </li>
                ))}
              </ul>
            )}
            {schema && (
              <p className="mt-3 text-xs text-muted">
                Limits shared by all sources: {Math.round(schema.max_file_bytes / 1024 / 1024)} MiB, {schema.max_records.toLocaleString("en-US")}{" "}
                records.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
