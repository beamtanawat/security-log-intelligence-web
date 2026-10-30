import { useId, useRef, useState } from "react";
import { api } from "../api/client";
import type { Schema, SourceSchema, SourceType } from "../api/types";
import { formatBytes } from "../lib/format";

export function validateFile(file: File, maxBytes: number): string | null {
  if (!file.name.toLowerCase().endsWith(".csv")) return "Only .csv files are supported.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > maxBytes) return `The file is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`;
  return null;
}

interface Props {
  schema: Schema | null;
  sources: SourceSchema[];
  sourceType: SourceType;
  onSourceChange: (s: SourceType) => void;
  disabled: boolean;
  onUpload: (file: File) => void;
  onDemo: () => void;
}

export function UploadForm({ schema, sources, sourceType, onSourceChange, disabled, onUpload, onDemo }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const maxBytes = schema?.max_file_bytes ?? 10 * 1024 * 1024;
  const sourceName = sources.find((s) => s.source_type === sourceType)?.name ?? sourceType;

  const choose = (f: File | undefined | null) => {
    if (!f) return;
    const err = validateFile(f, maxBytes);
    setProblem(err);
    setFile(err ? null : f);
  };

  return (
    <form
      className="panel p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (file) onUpload(file);
      }}
      aria-label="Upload log CSV"
    >
      {sources.length > 0 && (
        <fieldset disabled={disabled}>
          <legend className="panel-title">Log source</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {sources.map((s) => (
              <label
                key={s.source_type}
                className={`btn cursor-pointer ${s.source_type === sourceType ? "!border-cyan-glow !bg-ink-900 text-cyan-glow" : ""}`}
              >
                <input
                  type="radio"
                  name="source_type"
                  value={s.source_type}
                  className="sr-only-input"
                  checked={s.source_type === sourceType}
                  onChange={() => {
                    // a file chosen for one source must not silently go to another parser
                    setFile(null);
                    setProblem(null);
                    if (inputRef.current) inputRef.current.value = "";
                    onSourceChange(s.source_type);
                  }}
                />
                {s.name}
                <span className="text-xs text-muted">· {s.engine}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label
        htmlFor={inputId}
        className={`dropzone block cursor-pointer rounded-lg border-2 border-dashed border-line p-8 text-center ${dragging ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) choose(e.dataTransfer.files[0]);
        }}
      >
        <span className="block text-lg font-semibold">Drop a {sourceName} file here, or choose a file</span>
        <span className="mt-1 block text-sm text-muted">
          .csv, UTF-8, up to {formatBytes(maxBytes)}
          {schema ? ` and ${schema.max_records.toLocaleString("en-US")} records` : ""}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          className="sr-only-input"
          type="file"
          accept=".csv,text/csv"
          disabled={disabled}
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>

      <div aria-live="polite" className="min-h-6 text-sm">
        {problem && (
          <p role="alert" className="text-bad">
            {problem}
          </p>
        )}
        {file && !problem && (
          <p>
            Selected: <span className="mono">{file.name}</span> ({formatBytes(file.size)})
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={disabled || !file}>
          Analyze file
        </button>
        <button type="button" className="btn" disabled={disabled} onClick={onDemo}>
          Try synthetic {sourceName} data
        </button>
        <a className="btn" href={api.sampleUrl(sourceType)} download>
          Download sample CSV
        </a>
      </div>
      {sourceType === "unsw_nb15" && (
        <p className="text-sm text-warn">
          Full official UNSW-NB15 train/test files can exceed the size or row limit. Upload a subset you select yourself; oversized files are
          rejected, never silently truncated.
        </p>
      )}
      <p className="text-sm text-muted">
        Uploaded data is temporary: kept for at most {schema ? Math.round(schema.retention_seconds / 60) : 60} minutes and may be lost
        sooner if the server restarts. Nothing is saved to an account.
      </p>
    </form>
  );
}
