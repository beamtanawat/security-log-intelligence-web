"""Synthetic fixtures and polling for the new web boundary."""
import csv
import io
import time
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from parsers.fortigate import BASELINE_FORTIGATE_FIELDS


def csv_bytes(rows=None, headers=None, bom=False):
    headers = list(BASELINE_FORTIGATE_FIELDS if headers is None else headers)
    rows = [{}] if rows is None else rows
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=headers)
    writer.writeheader()
    for i, changes in enumerate(rows, 1):
        values = dict.fromkeys(headers, '')
        values.update({k: v for k, v in {
            'loguid': f'SYNTHETIC_{i}', 'itime': '1793318400',
            'src_ip': 'SRCIP_SYNTHETIC', 'dst_ip': 'DSTIP_SYNTHETIC',
            'net_proto': '6', 'src_port': '50000', 'dst_port': '443',
            'app_service': 'HTTPS', 'event_action': 'accept',
        }.items() if k in values})
        values.update(changes)
        writer.writerow(values)
    return stream.getvalue().encode('utf-8-sig' if bom else 'utf-8')


def wait_job(client, analysis_id):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        response = client.get(f'/api/jobs/{analysis_id}')
        if response.status_code != 200:
            return response
        if response.json()['state'] in {'completed', 'failed', 'expired'}:
            return response
        time.sleep(.005)
    raise AssertionError('job did not terminate within 5 seconds')


def submit(client, content=None):
    response = client.post('/api/uploads', files={'file': ('events.csv', csv_bytes() if content is None else content, 'text/csv')})
    assert response.status_code == 202, response.text
    return response.json()['analysis_id']
