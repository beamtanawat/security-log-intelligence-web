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
