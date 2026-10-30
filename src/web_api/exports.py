"""Disk-backed findings queries and streaming exports with spreadsheet-safe cells."""
import csv
import io
import json
from collections.abc import Iterator, Sequence
from pathlib import Path

CSV_FIELDS = ('finding_id','source_record_number','event_time','source_identifier',
              'destination_identifier','destination_port','rule_id','severity','reason','evidence_json')


def iter_findings(path: Path, *, severity: str = '', rule_id: str = '') -> Iterator[dict]:
    with path.open(encoding='utf-8') as handle:
        for line in handle:
            item = json.loads(line)
            if severity and item['severity'] != severity:
                continue
            if rule_id and item['rule_id'] != rule_id:
                continue
            yield item


def safe_cell(value):
    if isinstance(value,str) and (value.startswith(('\t','\r','\n')) or value.lstrip().startswith(('=','+','-','@'))):
        return "'" + value
    return value


def export_chunks(findings, format: str):
    if format == 'json':
        yield '['
        separator = ''
        for finding in findings:
            yield separator + json.dumps(finding,ensure_ascii=False,allow_nan=False)
            separator = ','
        yield ']'
    else:
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output,fieldnames=CSV_FIELDS)
        writer.writeheader()
        yield output.getvalue()
        for item in findings:
            output.seek(0)
            output.truncate()
            row = {key:item.get(key) for key in CSV_FIELDS}
            row['evidence_json'] = json.dumps(item['evidence'],ensure_ascii=False)
            writer.writerow({key:safe_cell(value) for key,value in row.items()})
            yield output.getvalue()


def export_findings(findings: Sequence[dict], format: str) -> bytes:
    """Convenience entry point for bounded callers; API uses streaming chunks."""
    return ''.join(export_chunks(findings,format)).encode('utf-8')
