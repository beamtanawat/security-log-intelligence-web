"""Job tests exercise busy, expiry and restart instead of depending on thread timing."""
from threading import Event
from fastapi.testclient import TestClient
from web_support import csv_bytes, submit, wait_job
from test_web_uploads import web_client, foreign_client


def test_busy_slot_bounds_queue_without_reading_another_upload(tmp_path):
    with web_client(tmp_path) as (client, app):
        owner = 'internal-test-owner'
        pending = app.state.jobs.reserve(owner, 'reserved.csv', False)
        try:
            response = client.post('/api/demo')
            assert response.status_code == 429
            assert response.headers['retry-after']
        finally:
            app.state.jobs.abandon(pending)
        ident = submit(client)
        assert wait_job(client, ident).json()['state'] == 'completed'


def test_expiry_erases_files_and_returns_owner_only_tombstone(tmp_path):
    clock = [1_800_000_000.0]
    with web_client(tmp_path, clock=lambda: clock[0]) as (client, app):
        ident = submit(client)
        wait_job(client, ident)
        directory = app.state.jobs.directory(ident)
        clock[0] += 3601
        assert client.get(f'/api/jobs/{ident}').status_code == 410
        assert not directory.exists()
        with foreign_client(app) as stranger:
            assert stranger.get(f'/api/jobs/{ident}').status_code == 404


def test_completed_jobs_have_global_capacity_limit(tmp_path):
    with web_client(tmp_path, max_retained_jobs=1) as (client, app):
        ident = submit(client)
        wait_job(client, ident)
        assert client.post('/api/demo').status_code == 429


def test_restart_discards_previous_jobs_and_session(tmp_path):
    with web_client(tmp_path) as (client, app):
        ident = submit(client)
        wait_job(client, ident)
        cookie = client.cookies.get('sli_session')
    with web_client(tmp_path) as (client, app):
        client.cookies.set('sli_session', cookie)
        assert client.get(f'/api/jobs/{ident}').status_code == 404
        assert list(app.state.jobs.data_dir.iterdir()) == []


def test_authorized_reader_is_open_before_expiry_cleanup_and_closes_after(tmp_path):
    import hashlib
    from web_api.exports import export_chunks
    clock = [1_800_000_000.0]
    with web_client(tmp_path, clock=lambda:clock[0]) as (client, app):
        ident = submit(client, csv_bytes([{'event_subtype':'anomaly'}]))
        wait_job(client, ident)
        token = client.cookies.get('sli_session').partition('.')[0]
        owner = hashlib.sha256(token.encode()).hexdigest()
        reader = app.state.jobs.open_findings(ident, owner)
        try:
            chunks = export_chunks(reader.matching(), 'json')
            assert next(chunks) == '['
            clock[0] += 3601
            app.state.jobs.cleanup()
            assert 'fortigate.anomaly_subtype_observation' in ''.join(chunks)
            assert client.get(f'/api/jobs/{ident}').status_code == 410
        finally:
            reader.close()
        assert not app.state.jobs.directory(ident).exists()


def test_accepted_upload_renews_same_session_ownership(tmp_path):
    with web_client(tmp_path) as (client, app):
        client.get('/api/schema')
        original = client.cookies.get('sli_session')
        response = client.post('/api/uploads',files={'file':('events.csv',csv_bytes())})
        assert response.status_code == 202
        assert 'max-age=3600' in response.headers.get('set-cookie','').lower()
        assert client.cookies.get('sli_session') == original
        assert wait_job(client,response.json()['analysis_id']).json()['state'] == 'completed'


def test_stalled_upload_times_out_and_releases_the_only_slot(tmp_path):
    import asyncio
    import httpx
    with web_client(tmp_path, upload_timeout_seconds=.03) as (client, app):
        async def probe():
            async def slow_body():
                yield b'--slow\r\nContent-Disposition: form-data; name="file"; filename="events.csv"\r\n\r\n'
                await asyncio.sleep(.2)
                yield b'never arrives before deadline'
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://testserver') as async_client:
                return await async_client.post('/api/uploads',content=slow_body(),headers={'Content-Type':'multipart/form-data; boundary=slow'})
        response = asyncio.run(probe())
        assert response.status_code == 408
        assert response.json()['error']['code'] == 'UPLOAD_TIMEOUT'
        assert list(app.state.jobs.data_dir.iterdir()) == []
        ident = submit(client)
        assert wait_job(client,ident).json()['state'] == 'completed'


def test_stream_header_failure_releases_expired_reader(tmp_path):
    import asyncio
    import hashlib
    import pytest
    from starlette.requests import ClientDisconnect
    from web_api.app import FindingsResponse
    from web_api.exports import export_chunks
    clock = [1_800_000_000.0]
    with web_client(tmp_path,clock=lambda:clock[0]) as (client,app):
        ident = submit(client,csv_bytes([{'event_subtype':'anomaly'}]))
        wait_job(client,ident)
        token = client.cookies.get('sli_session').partition('.')[0]
        reader = app.state.jobs.open_findings(ident,hashlib.sha256(token.encode()).hexdigest())
        response = FindingsResponse(export_chunks(reader.matching(),'json'),reader=reader)
        clock[0] += 3601
        async def disconnected_send(message):
            raise OSError('controlled client disconnect')
        async def receive():
            return {'type':'http.disconnect'}
        with pytest.raises(ClientDisconnect):
            asyncio.run(response({'type':'http','asgi':{'spec_version':'2.4'}},receive,disconnected_send))
        assert reader.closed and reader.handle.closed
        assert not app.state.jobs.directory(ident).exists()
