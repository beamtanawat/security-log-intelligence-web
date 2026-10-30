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
