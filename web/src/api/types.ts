// Mirrors docs/web/api-contract.md (v1.1, plus the v1.2 prediction draft). Codex owns the contract; change here only after it changes.

export type SourceType = "fortigate" | "unsw_nb15";
export type Engine = "rules" | "profile";

export type Severity = "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH";
export type TimeStatus = "UNVERIFIED_EPOCH_SECONDS" | "UNAVAILABLE";
export type JobState = "queued" | "running" | "completed" | "failed" | "expired";
export type JobStage = "validating" | "normalizing" | "detecting" | "summarizing";

export interface ApiErrorBody {
  code: string;
  message: string;
  fields: string[];
}

export interface Capabilities {
  findings: boolean;
  records: boolean;
  labels: boolean;
  timeline: boolean;
  network_identifiers: boolean;
  ports: boolean;
  denied_events: boolean;
  model_inference: boolean;
  evaluation: boolean;
  // v1.2 draft: true only when this analysis has retrievable predictions. Omitted in older releases.
  predictions?: boolean;
}

export interface SourceSchema {
  source_type: SourceType;
  name: string;
  engine: Engine;
  required_columns: string[];
  optional_columns: string[];
  rules: { rule_id: string; name: string; severity: Severity; category: string }[];
  capabilities: Capabilities;
}

export interface Schema {
  // Top-level fields describe the default (FortiGate) source for legacy clients.
  source_type: SourceType;
  required_columns: string[];
  max_file_bytes: number;
  max_records: number;
  retention_seconds: number;
  engine: Engine;
  severities: Severity[];
  rules: { rule_id: string; name: string; severity: Severity }[];
  chat_available: boolean;
  sources?: SourceSchema[];
}

export interface Accepted {
  analysis_id: string;
  state: "queued";
  status_url: string;
}

export interface Job {
  analysis_id: string;
  state: JobState;
  stage: JobStage | null;
  error: ApiErrorBody | null;
  expires_at: string;
}

export interface Labels {
  source: "uploaded_columns_not_predictions";
  available: boolean;
  labeled_records: number;
  unlabeled_records: number;
  invalid_label_records: number;
  binary_counts: { label: "NORMAL" | "ATTACK"; count: number }[];
  attack_category_counts: { category: string; count: number }[];
}

export interface NumericStat {
  field: string;
  count: number;
  missing: number;
  invalid: number;
  min: number | null;
  max: number | null;
  mean: number | null;
}

export interface Summary {
  analysis_id: string;
  filename: string;
  engine: Engine;
  // v1.1 additions; optional so a v1 response is still accepted (FortiGate defaults).
  source_type?: SourceType;
  capabilities?: Capabilities;
  inference?: Inference;
  labels?: Labels | null;
  protocol_counts?: { protocol: string; count: number }[];
  state_counts?: { state: string; count: number }[];
  numeric_stats?: NumericStat[];
  is_demo: boolean;
  created_at: string;
  expires_at: string;
  time: {
    start: string | null;
    end: string | null;
    status: TimeStatus;
    unknown_records: number;
    derived_records: number;
    bin_seconds: number | null;
  };
  counts: {
    input_records: number;
    analyzed_records: number;
    records_with_issues: number;
    denied_events: number | null; // null when the source does not support it
    findings: number;
  };
  quality: {
    invalid_records: number;
    issues_by_code: { code: string; count: number }[];
  };
  severity_counts: { name: Severity; count: number }[];
  rule_counts: { rule_id: string; count: number }[];
  timeline: { time: string; count: number }[];
  top_sources: { identifier: string; count: number }[];
  top_ports: { port: number; count: number }[];
  top_applications: { name: string; count: number }[];
  summary: { mode: "deterministic"; text: string; finding_ids: string[] };
}

export type PredictedClass = "NORMAL" | "ATTACK";

export interface ModelMetadata {
  model_id: string;
  family: string;
  artifact_sha256: string;
  training_dataset: string;
  trained_at: string | null; // null unless verified from model provenance
}

export type Inference =
  | { available: false; reason: string; error_code?: string }
  | {
      available: true;
      model: ModelMetadata;
      threshold: number;
      scored_records: number;
      unscored_records: number;
      prediction_counts: { class_name: PredictedClass; count: number }[];
      evaluation: { status: "not_evaluated" };
      disclaimer: string;
    };

export type EvidenceValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: EvidenceValue }
  | EvidenceValue[];

export interface Evidence {
  field: string;
  value: EvidenceValue;
  source_fields: string[];
  mapping_operation: string;
  interpretation_status: string;
}

export interface NormalizationIssue {
  source_field: string | null;
  issue_code: string;
  status: string;
  description: string;
}

export interface Finding {
  finding_id: string;
  source_record_number: number;
  event_time: string | null;
  time_status: TimeStatus;
  source_identifier: string | null;
  destination_identifier: string | null;
  destination_port: number | null;
  rule_id: string;
  severity: Severity;
  reason: string;
  reason_code: string;
  evidence: Evidence[];
  normalization_issues: NormalizationIssue[];
  uncertainties: string[];
  false_positive_note: string;
}

export interface FindingsPage {
  items: Finding[];
  total: number;
  offset: number;
  limit: number;
}

export interface FindingsFilter {
  severity: string;
  rule_id: string;
}

export interface FlowRecord {
  source_record_number: number;
  source_type: "unsw_nb15";
  source_id: string | null;
  feature_values: Record<string, number | string | null>;
  ground_truth: null | { label: 0 | 1 | null; label_raw: string; attack_cat: string | null };
  normalization_issues: NormalizationIssue[];
}

export interface RecordsPage {
  items: FlowRecord[];
  total: number;
  offset: number;
  limit: number;
}

// GET /api/analyses/{id}/predictions (v1.2 draft). score is uncalibrated model output, not a probability.
export type Prediction =
  | {
      source_record_number: number;
      status: "scored";
      class_name: PredictedClass;
      score: number;
      score_kind: "model_attack_score";
      threshold: number;
      error_code: null;
    }
  | {
      source_record_number: number;
      status: "unscored";
      class_name: null;
      score: null;
      score_kind: null;
      threshold: null;
      error_code: string;
    };

export interface PredictionsPage {
  items: Prediction[];
  total: number;
  offset: number;
  limit: number;
}

// GET /api/evaluation: global historical UNSW-NB15 benchmark, never about the current upload.
export interface EvaluationModel {
  model: string;
  metrics: {
    accuracy: number;
    f1: number;
    precision: number;
    recall: number;
    average_precision: number;
    roc_auc: number;
  };
  confusion_matrix: { tp: number; tn: number; fp: number; fn: number };
  threshold: number;
  source_report: string;
  source_report_sha256: string;
  source_table_url: string;
  row_count: number;
}

export interface Evaluation {
  scope: "historical_benchmark";
  dataset: string;
  split: string;
  applies_to_current_upload: boolean;
  inference_available: boolean;
  computed_at: string | null;
  upstream_repository: string;
  upstream_commit: string;
  preferred_model: string;
  preferred_model_basis: string;
  test_newly_unseen: boolean;
  statistical_significance_claim: boolean;
  limitations: string[];
  models: EvaluationModel[];
}
