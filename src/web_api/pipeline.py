"""Stream new uploads through existing pure analysis modules, not frozen builders."""
import json
from pathlib import Path
from collections.abc import Callable
from detection.engine import evaluate_event
from detection.rules import ACTIVE_RULES
from normalization.fortigate import normalize_fortigate_record
from parsers.fortigate import iter_fortigate_records, FortiGateAdapterError
from .contracts import AnalysisResult, WebError
from .summary import SummaryBuilder


def analyze_csv(path: Path, *, max_records: int = 50_000, stage: Callable[[str],None] = lambda value: None) -> AnalysisResult:
    aggregate = SummaryBuilder(ACTIVE_RULES)
    output = path.parent / 'findings.jsonl'
    staging = path.parent / 'findings.part'
    issues_path = path.parent / 'issues.part'
    try:
        stage('validating')
        with staging.open('x', encoding='utf-8') as handle, issues_path.open('x',encoding='utf-8') as issues_handle:
            for record in iter_fortigate_records(path):
                if record.record_number > max_records:
                    raise WebError(413,'TOO_MANY_RECORDS',f'CSV exceeds the {max_records:,} record limit.')
                stage('normalizing')
                event = normalize_fortigate_record(record)
                findings = evaluate_event(event, ACTIVE_RULES)
                aggregate.add(event, findings)
                issues = [i.to_dict() for i in event.normalization_issues]
                if issues:
                    issues_handle.write(json.dumps({'source_record_number':record.record_number,'issues':issues},ensure_ascii=False)+'\n')
                for finding in findings:
                    item = {
                        'finding_id':finding.finding_id, 'source_record_number':record.record_number,
                        'event_time':event.time.get('itime_utc_derived'),
                        'time_status':'UNVERIFIED_EPOCH_SECONDS' if event.time.get('itime_utc_derived') else 'UNAVAILABLE',
                        'source_identifier':event.network['source'].get('identifier'),
                        'destination_identifier':event.network['destination'].get('identifier'),
                        'destination_port':event.network['destination'].get('port'),
                        'rule_id':finding.rule.rule_id,'severity':finding.rule.severity,
                        'reason':finding.summary,'reason_code':finding.reason_code,
                        'evidence':[{'field':e.canonical_path,'value':e.to_dict()['observed_value'],
                                     'source_fields':list(e.source_fields),'mapping_operation':e.mapping_operation,
                                     'interpretation_status':e.interpretation_status} for e in finding.evidence],
                        'normalization_issues':issues,'uncertainties':list(finding.uncertainties),
                        'false_positive_note':finding.false_positive_note,
                    }
                    handle.write(json.dumps(item,ensure_ascii=False,allow_nan=False)+'\n')
        stage('summarizing')
        summary = aggregate.finish()
        staging.replace(output)
        issues_path.replace(path.parent / 'issues.jsonl')
        return AnalysisResult(summary=summary, findings_path=output)
    except FortiGateAdapterError as error:
        fields = [f'record:{error.record_number}'] if error.record_number else []
        # Filesystem errors must never disclose a server path.
        message = str(error) if error.code in {
            'EMPTY_CSV','EMPTY_HEADER','BLANK_HEADER','DUPLICATE_HEADER','MISSING_BASELINE_FIELDS',
            'ROW_WIDTH_MISMATCH','INVALID_UTF8','CSV_PARSE_ERROR','HEADER_ONLY_CSV'
        } else 'The uploaded CSV could not be read. Please upload it again.'
        raise WebError(422,error.code,message,fields) from error
    finally:
        staging.unlink(missing_ok=True)
        issues_path.unlink(missing_ok=True)
