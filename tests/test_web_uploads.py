"""Upload tests catch dropped rows, false success, unbounded input and cross-session access."""
from contextlib import contextmanager
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from web_support import csv_bytes, submit, wait_job


@contextmanager
def web_client(tmp_path, **overrides):
    from web_api.app import create_app
    from web_api.contracts import WebSettings
    settings = WebSettings(data_dir=tmp_path / 'jobs', allowed_hosts=('testserver',), **overrides)
    app = create_app(settings)
    with TestClient(app) as client:
        yield client, app


@contextmanager
def foreign_client(app):
    # A second browser shares the existing application lifespan, not a restart.
    client = TestClient(app)
    try:
        yield client
    finally:
        client.close()


def test_valid_upload_reaches_complete_and_preserves_original(tmp_path):
    with web_client(tmp_path) as (client, app):
        raw = csv_bytes([{'event_subtype': 'anomaly'}], bom=True)
        ident = submit(client, raw)
        job = wait_job(client, ident)
        assert job.json()['state'] == 'completed', job.text
        assert (app.state.jobs.directory(ident) / 'source.csv').read_bytes() == raw
        assert client.cookies.get('sli_session')
        assert client.get(f'/api/analyses/{ident}/summary').json()['counts']['input_records'] == 1


@pytest.mark.parametrize('content,code', [
    (b'', 'EMPTY_CSV'),
    (b'only_one_column\nx\n', 'MISSING_BASELINE_FIELDS'),
    (b'itime,itime\n1,2\n', 'DUPLICATE_HEADER'),
    (csv_bytes(rows=[]), 'HEADER_ONLY_CSV'),
    (csv_bytes() + b'broken,row\n', 'ROW_WIDTH_MISMATCH'),
    (csv_bytes() + b'\xff', 'INVALID_UTF8'),
])
def test_structural_failure_never_publishes_partial_results(tmp_path, content, code):
    with web_client(tmp_path) as (client, app):
        ident = submit(client, content)
        job = wait_job(client, ident).json()
        assert job['state'] == 'failed'
        assert job['error']['code'] == code
        assert '/workspace' not in job['error']['message']
        assert client.get(f'/api/analyses/{ident}/summary').status_code == 409
        assert not (app.state.jobs.directory(ident) / 'findings.jsonl').exists()


def test_upload_byte_limit_and_wrong_extension(tmp_path):
    with web_client(tmp_path, max_file_bytes=4096) as (client, app):
        response = client.post('/api/uploads', files={'file': ('too.csv', b'x'*4097)})
        assert response.status_code == 413
        response = client.post('/api/uploads', files={'file': ('bad.exe', csv_bytes())})
        assert response.status_code == 422
        assert client.post('/api/uploads').status_code == 422
        assert list(app.state.jobs.data_dir.iterdir()) == []


def test_record_limit_rejects_whole_analysis(tmp_path):
    with web_client(tmp_path, max_records=2) as (client, app):
        ident = submit(client, csv_bytes([{}, {}, {}]))
        job = wait_job(client, ident).json()
        assert job['state'] == 'failed'
        assert job['error']['code'] == 'TOO_MANY_RECORDS'


def test_demo_is_analyzed_and_schema_download_is_usable(tmp_path):
    with web_client(tmp_path) as (client, app):
        schema = client.get('/api/schema').json()
        assert schema['chat_available'] is False
        assert len(schema['rules']) == 2
        assert {r['severity'] for r in schema['rules']} == {'INFORMATIONAL'}
        sample = client.get('/api/sample')
        assert sample.status_code == 200
        ident = client.post('/api/demo').json()['analysis_id']
        assert wait_job(client, ident).json()['state'] == 'completed'
        summary = client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['is_demo'] is True
        assert summary['counts']['findings'] > 0
        uploaded = submit(client, sample.content)
        assert wait_job(client, uploaded).json()['state'] == 'completed'


def test_foreign_session_cannot_read_status_results_or_exports(tmp_path):
    with web_client(tmp_path) as (client, app):
        ident = submit(client, csv_bytes([{'event_subtype': 'anomaly'}]))
        wait_job(client, ident)
        with foreign_client(app) as stranger:
            for suffix in [f'jobs/{ident}', f'analyses/{ident}/summary', f'analyses/{ident}/findings', f'analyses/{ident}/export?format=json']:
                assert stranger.get('/api/' + suffix).status_code == 404


def test_foreign_origin_and_untrusted_host_rejected(tmp_path):
    with web_client(tmp_path) as (client, app):
        assert client.post('/api/demo', headers={'Origin': 'https://evil.example'}).status_code == 403
        assert client.post('/api/demo', headers={'Sec-Fetch-Site': 'cross-site'}).status_code == 403
        assert client.get('/api/schema', headers={'Host': 'evil.example'}).status_code == 400
