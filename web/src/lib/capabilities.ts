import type { Capabilities, SourceType, Summary } from "../api/types";

// A v1 summary (no capabilities field) can only come from the FortiGate rules engine.
const FORTIGATE_V1: Capabilities = {
  findings: true,
  records: false,
  labels: false,
  timeline: true,
  network_identifiers: true,
  ports: true,
  denied_events: true,
  model_inference: false,
  evaluation: false,
};

export function capabilitiesOf(summary: Summary): Capabilities {
  return summary.capabilities ?? FORTIGATE_V1;
}

export function sourceOf(summary: Summary): SourceType {
  return summary.source_type ?? "fortigate";
}

export const SOURCE_LABEL: Record<SourceType, string> = {
  fortigate: "FortiGate CSV",
  unsw_nb15: "UNSW-NB15 prepared CSV",
};

export type AvailableInference = Extract<NonNullable<Summary["inference"]>, { available: true }>;

/**
 * Predictions are shown only when the summary says this analysis has them. The draft contract
 * covers the UNSW-NB15 S2 model only, so FortiGate never gets an S2 prediction panel.
 */
export function predictionsOf(summary: Summary): AvailableInference | null {
  const inference = summary.inference;
  if (capabilitiesOf(summary).predictions !== true || sourceOf(summary) !== "unsw_nb15") return null;
  return inference?.available === true ? inference : null;
}

export type AvailableAnomalyInference = Extract<NonNullable<Summary["anomaly_inference"]>, { available: true }>;

/** FortiGate Isolation Forest scores; separate from rule findings and never shown for other sources. */
export function anomaliesOf(summary: Summary): AvailableAnomalyInference | null {
  const anomaly = summary.anomaly_inference;
  if (capabilitiesOf(summary).anomalies !== true || sourceOf(summary) !== "fortigate") return null;
  return anomaly?.available === true ? anomaly : null;
}
