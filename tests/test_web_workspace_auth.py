"""Authentication API must fail closed and trust only the configured identity service."""
import io
import json
from urllib.error import HTTPError, URLError
from test_web_uploads import web_client

USER_ID = '00000000-0000-4000-8000-000000000001'


def test_workspace_auth_is_unavailable_without_configuration(tmp_path):
    with web_client(tmp_path) as (client,app):
        response=client.get('/api/workspace/me',headers={'Authorization':'Bearer example'})
        assert response.status_code==503 and response.json()['error']['code']=='AUTH_NOT_CONFIGURED'


def test_workspace_auth_rejects_missing_token_and_returns_verified_user(tmp_path,monkeypatch):
    import web_api.workspace_auth as auth
    seen=[]
    class Reply:
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def read(self,n): return json.dumps({'id':USER_ID}).encode()
    class Opener:
        def open(self,request,timeout):
            seen.append((request.full_url,request.get_header('Authorization'),request.get_header('Apikey')))
            return Reply()
    monkeypatch.setattr(auth.urllib.request,'build_opener',lambda *args:Opener())
    with web_client(tmp_path,supabase_url='https://example.supabase.co',supabase_publishable_key='public-test-key') as (client,app):
        assert client.get('/api/workspace/me').status_code==401
        response=client.get('/api/workspace/me',headers={'Authorization':'Bearer synthetic-token'})
        assert response.status_code==200 and response.json()=={'user_id':USER_ID}
        assert seen==[('https://example.supabase.co/auth/v1/user','Bearer synthetic-token','public-test-key')]
        assert client.get('/api/workspace/me',headers={'Authorization':'Basic abc'}).status_code==401


def test_workspace_auth_rejects_invalid_provider_response_and_untrusted_url(tmp_path,monkeypatch):
    import web_api.workspace_auth as auth
    class Opener:
        def open(self,request,timeout):
            raise HTTPError(request.full_url,401,'unauthorized',{},io.BytesIO())
    monkeypatch.setattr(auth.urllib.request,'build_opener',lambda *args:Opener())
    with web_client(tmp_path,supabase_url='https://example.supabase.co',supabase_publishable_key='public-test-key') as (client,app):
        assert client.get('/api/workspace/me',headers={'Authorization':'Bearer expired'}).status_code==401
    with web_client(tmp_path,supabase_url='https://example.supabase.co.attacker.test',supabase_publishable_key='public-test-key') as (client,app):
        response=client.get('/api/workspace/me',headers={'Authorization':'Bearer example'})
        assert response.status_code==503 and response.json()['error']['code']=='AUTH_CONFIGURATION_INVALID'


def test_workspace_auth_fails_closed_if_provider_unreachable(tmp_path,monkeypatch):
    import web_api.workspace_auth as auth
    class Opener:
        def open(self,request,timeout): raise URLError('unavailable')
    monkeypatch.setattr(auth.urllib.request,'build_opener',lambda *args:Opener())
    with web_client(tmp_path,supabase_url='https://example.supabase.co',supabase_publishable_key='public-test-key') as (client,app):
        response=client.get('/api/workspace/me',headers={'Authorization':'Bearer synthetic-token'})
        assert response.status_code==503 and response.json()['error']['code']=='AUTH_PROVIDER_UNAVAILABLE'
        assert 'synthetic-token' not in response.text
    assert auth._NoRedirect().redirect_request(None,None,302,'',{},'https://other.example') is None


def test_authenticated_jobs_are_bound_to_user_and_browser_session(tmp_path,monkeypatch):
    from web_support import wait_job
    import web_api.workspace_auth as auth
    other='00000000-0000-4000-8000-000000000002'
    def verified(authorization,url,key):
        if authorization=='Bearer user-a': return USER_ID
        if authorization=='Bearer user-b': return other
        raise AssertionError('unexpected token')
    monkeypatch.setattr(auth,'verified_user_id',verified)
    with web_client(tmp_path,supabase_url='https://example.supabase.co',supabase_publishable_key='public-test-key') as (client,app):
        a={'Authorization':'Bearer user-a'}
        b={'Authorization':'Bearer user-b'}
        response=client.post('/api/demo',headers=a)
        assert response.status_code==202
        ident=response.json()['analysis_id']
        import time
        for _ in range(1000):
            job=client.get(f'/api/jobs/{ident}',headers=a)
            if job.json().get('state') in ('completed','failed'): break
            time.sleep(.005)
        assert job.json()['state']=='completed'
        assert client.get(f'/api/jobs/{ident}',headers=b).status_code==404
        assert client.get(f'/api/jobs/{ident}').status_code==404
        assert client.get(f'/api/analyses/{ident}/summary',headers=a).status_code==200


def test_workspace_rejects_remote_database_without_verified_tls(tmp_path,monkeypatch):
    import web_api.workspace_auth as auth
    monkeypatch.setattr(auth,'verified_user_id',lambda authorization,url,key:USER_ID)
    opts={'workspace_database_url':'postgresql://user:private@db.example.test/db?sslmode=disable',
          'supabase_url':'https://example.supabase.co','supabase_publishable_key':'public-test'}
    with web_client(tmp_path,**opts) as (client,app):
        response=client.get('/api/workspace/analyses',headers={'Authorization':'Bearer user-a'})
        assert response.status_code==503
        assert response.json()['error']['code']=='WORKSPACE_CONFIGURATION_INVALID'
        assert 'private' not in response.text


def test_background_cleanup_purges_expired_workspace_rows(tmp_path,monkeypatch):
    from web_api.contracts import WebSettings
    from web_api.jobs import JobStore
    import web_api.workspace_history as history
    calls=[]
    store=JobStore(WebSettings(data_dir=tmp_path,workspace_database_url='local-test'))
    monkeypatch.setattr(history,'purge_expired',lambda database_url: calls.append(database_url))
    waits=iter((False,True))
    monkeypatch.setattr(store._stop,'wait',lambda timeout: next(waits))
    store._cleanup_loop()
    assert calls==['local-test']
