"""Production-serving checks use a tiny build fixture, not a substitute user interface."""
from pathlib import Path
from web_support import csv_bytes, submit, wait_job
from test_web_uploads import web_client


def test_production_build_serving_and_api_errors_are_separate(tmp_path):
    build = tmp_path / 'dist'
    (build/'assets').mkdir(parents=True)
    (build/'index.html').write_text('<!doctype html><title>Build fixture</title>')
    (build/'assets'/'app.js').write_text('console.log("fixture")')
    with web_client(tmp_path, frontend_dir=build) as (client, app):
        assert client.get('/').status_code == 200
        assert 'Build fixture' in client.get('/analysis/abc').text
        assert client.get('/assets/app.js').status_code == 200
        assert client.get('/healthz').json()['frontend_ready'] is True
        missing = client.get('/api/not-a-route')
        assert missing.status_code == 404 and missing.headers['content-type'].startswith('application/json')
        assert client.get('/.env').status_code == 404
        assert client.get('/assets/does-not-exist.js').status_code == 404


def test_backend_health_does_not_claim_frontend_ready(tmp_path):
    with web_client(tmp_path, frontend_dir=tmp_path/'absent') as (client, app):
        assert client.get('/healthz').json()['frontend_ready'] is False
        assert client.get('/').status_code == 503


def test_chunked_body_limit_has_structured_error_and_releases_slot(tmp_path):
    with web_client(tmp_path, max_file_bytes=4096) as (client, app):
        boundary = 'test-boundary'
        def chunks():
            yield f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="events.csv"\r\n\r\n'.encode()
            yield b'x' * (4096+65536+1)
            yield f'\r\n--{boundary}--\r\n'.encode()
        response = client.post('/api/uploads', content=chunks(), headers={'Content-Type':f'multipart/form-data; boundary={boundary}'})
        assert response.status_code == 413
        assert response.json()['error']['code'] == 'REQUEST_TOO_LARGE'
        ident = submit(client)
        assert wait_job(client, ident).json()['state'] == 'completed'


def test_cookie_is_httponly_and_does_not_have_sliding_expiration(tmp_path):
    with web_client(tmp_path) as (client, app):
        first = client.get('/api/schema')
        cookie = first.headers['set-cookie'].lower()
        assert 'httponly' in cookie and 'samesite=strict' in cookie
        assert 'set-cookie' not in client.get('/api/schema').headers
