import { useEffect, useState } from "react";
import { api, describeError } from "../api/client";
import type { Finding } from "../api/types";
import { Drawer } from "./Drawer";
import { SEVERITY_GLYPH, timeOrUnknown, TIME_NOTE, valueToText } from "../lib/format";

interface Props {
  analysisId: string;
  findingId: string;
  onClose: () => void;
  onExpired: () => void;
}

export function FindingDetail({ analysisId, findingId, onClose, onExpired }: Props) {
  const [finding, setFinding] = useState<Finding | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setFinding(null);
    setError(null);
    api.finding(analysisId, findingId, ctrl.signal).then(setFinding, (e) => {
      if (e instanceof DOMException) return;
      if (e?.kind === "expired") return onExpired();
      setError(describeError(e));
    });
    return () => ctrl.abort();
  }, [analysisId, findingId, onExpired]);

  return (
    <Drawer title="Finding detail" onClose={onClose}>
        {error && (
          <p role="alert" className="mt-4 text-bad">
            {error.title}. {error.detail}
          </p>
        )}
        {!finding && !error && <p className="mt-4 text-muted">Loading…</p>}

        {finding && (
          <div className="mt-4 space-y-5">
            <section>
              <p>{finding.reason}</p>
              <p className="mono mt-1 text-muted">
                {finding.rule_id} · {finding.reason_code}
              </p>
              <p className="mt-2">
                <span className="badge text-muted">
                          <span aria-hidden="true">{SEVERITY_GLYPH[finding.severity]}</span>
                          {finding.severity}
                        </span>
              </p>
            </section>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Source record</dt>
              <dd className="mono">#{finding.source_record_number} (data-record ordinal, not CSV line)</dd>
              <dt className="text-muted">Event time</dt>
              <dd>{timeOrUnknown(finding.event_time)}</dd>
              <dt className="text-muted">Source id</dt>
              <dd className="mono">{finding.source_identifier ?? "—"}</dd>
              <dt className="text-muted">Destination id</dt>
              <dd className="mono">{finding.destination_identifier ?? "—"}</dd>
              <dt className="text-muted">Dest. port</dt>
              <dd className="mono">{finding.destination_port ?? "—"}</dd>
            </dl>
            {finding.time_status === "UNVERIFIED_EPOCH_SECONDS" && <p className="text-xs text-muted">{TIME_NOTE}</p>}

            <section>
              <h3 className="panel-title">Evidence</h3>
              {finding.evidence.length === 0 ? (
                <p className="mt-1 text-sm text-muted">No evidence items.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {finding.evidence.map((ev, i) => (
                    <li key={i} className="rounded-lg border border-line p-3 text-sm">
                      <p className="mono font-semibold">{ev.field}</p>
                      <pre className="mono mt-1 whitespace-pre-wrap">{valueToText(ev.value)}</pre>
                      <p className="mt-1 text-xs text-muted">
                        from {ev.source_fields.join(", ") || "—"} · {ev.mapping_operation} · {ev.interpretation_status}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="panel-title">Normalization issues</h3>
              {finding.normalization_issues.length === 0 ? (
                <p className="mt-1 text-sm text-muted">None recorded for this record.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {finding.normalization_issues.map((iss, i) => (
                    <li key={i} className="rounded-lg border border-line p-3">
                      <p className="mono">
                        {iss.issue_code} · {iss.status} · {iss.source_field ?? "no field"}
                      </p>
                      <p className="mt-1">{iss.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="panel-title">Uncertainties</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {finding.uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="panel-title">Possible false positives</h3>
              <p className="mt-1 text-sm">{finding.false_positive_note}</p>
            </section>
          </div>
        )}
    </Drawer>
  );
}
