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


def test_exact_api_namespace_never_returns_frontend_html(tmp_path):
    build = tmp_path/'dist'
    build.mkdir()
    (build/'index.html').write_text('<title>SPA fixture</title>')
    with web_client(tmp_path,frontend_dir=build) as (client,app):
        response = client.get('/api')
        assert response.status_code == 404
        assert response.headers['content-type'].startswith('application/json')


def test_https_deployment_uses_secure_cookie_and_accepts_only_same_origin(tmp_path, monkeypatch):
    from web_api.app import create_app
    from web_api.contracts import WebSettings
    from fastapi.testclient import TestClient
    from dataclasses import replace
    monkeypatch.setenv('RENDER_EXTERNAL_HOSTNAME','sli-owned.onrender.com')
    monkeypatch.delenv('SLI_ALLOWED_HOSTS',raising=False)
    monkeypatch.delenv('SLI_SECURE_COOKIES',raising=False)
    settings = replace(WebSettings.from_env(), data_dir=tmp_path/'jobs')
    with TestClient(create_app(settings),base_url='https://sli-owned.onrender.com') as client:
        accepted = client.post('/api/demo',headers={'Origin':'https://sli-owned.onrender.com'})
        assert accepted.status_code == 202
        assert 'secure' in accepted.headers['set-cookie'].lower()
        ident = accepted.json()['analysis_id']
        assert wait_job(client,ident).json()['state'] == 'completed'
        assert client.post('/api/demo',headers={'Origin':'http://sli-owned.onrender.com'}).status_code == 403


def test_exception_during_application_lifespan_still_cleans_jobs(tmp_path):
    import asyncio
    import pytest
    from web_api.app import create_app
    from web_api.contracts import WebSettings
    app = create_app(WebSettings(data_dir=tmp_path/'jobs'))
    async def exercise():
        with pytest.raises(RuntimeError, match='controlled application error'):
            async with app.router.lifespan_context(app):
                job = app.state.jobs.reserve('owner','synthetic.csv',True)
                (app.state.jobs.directory(job.analysis_id)/'source.csv').write_bytes(b'synthetic')
                raise RuntimeError('controlled application error')
    asyncio.run(exercise())
    assert list((tmp_path/'jobs').iterdir()) == []


def _page_csp(tmp_path, **overrides):
    build = tmp_path/'dist'
    build.mkdir(exist_ok=True)
    (build/'index.html').write_text('<title>CSP fixture</title>')
    with web_client(tmp_path,frontend_dir=build,**overrides) as (client,app):
        return client.get('/').headers['content-security-policy']


def test_page_csp_allows_only_self_without_workspace_auth(tmp_path):
    assert "connect-src 'self';" in _page_csp(tmp_path)


def test_page_csp_adds_validated_supabase_origin_for_browser_sign_in(tmp_path):
    csp = _page_csp(tmp_path,supabase_url='https://abcdefghijklmnop.supabase.co/',supabase_publishable_key='sb_publishable_fixture')
    assert "connect-src 'self' https://abcdefghijklmnop.supabase.co;" in csp


def test_page_csp_ignores_invalid_or_incomplete_supabase_settings(tmp_path):
    for url,key in (('http://abcdefghijklmnop.supabase.co','sb_publishable_fixture'),
                    ('https://evil.example.com','sb_publishable_fixture'),
                    ('https://abcdefghijklmnop.supabase.co/path','sb_publishable_fixture'),
                    ('https://abcdefghijklmnop.supabase.co',None)):
        assert "connect-src 'self';" in _page_csp(tmp_path,supabase_url=url,supabase_publishable_key=key)
