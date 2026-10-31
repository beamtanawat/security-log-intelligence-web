"""Integration tests require an explicitly configured disposable local Postgres."""
import os
import time
import uuid
from urllib.parse import urlsplit
import pytest
from test_web_uploads import web_client
from web_support import csv_bytes

DSN=os.getenv('SLI_TEST_WORKSPACE_DSN','')
pytestmark=pytest.mark.skipif(not DSN,reason='disposable PostgreSQL test DSN not configured')

@pytest.fixture
def owners():
    if urlsplit(DSN).hostname not in {'127.0.0.1','localhost'}:
        pytest.fail('workspace test DSN must point to local disposable PostgreSQL')
    import psycopg
    values=(uuid.uuid4(),uuid.uuid4())
    with psycopg.connect(DSN) as db:
        with db.cursor() as cursor:
            cursor.executemany('INSERT INTO auth.users(id) VALUES (%s)',[(v,) for v in values])
    yield values
    with psycopg.connect(DSN) as db:
        db.execute('DELETE FROM auth.users WHERE id = ANY(%s)',(list(values),))


def test_saved_analyses_survive_restart_and_isolate_users(tmp_path,monkeypatch,owners):
    import web_api.workspace_auth as auth
    from web_api.contracts import WebError
    a,b=map(str,owners)
    def verified(header,url,key):
        if header not in {'Bearer test-a','Bearer test-b'}:
            raise WebError(401,'AUTH_REQUIRED','Sign in to use the workspace.')
        return {'Bearer test-a':a,'Bearer test-b':b}[header]
    monkeypatch.setattr(auth,'verified_user_id',verified)
    options={'workspace_database_url':DSN,'supabase_url':'https://example.supabase.co','supabase_publishable_key':'public-test'}
    headers_a={'Authorization':'Bearer test-a'};headers_b={'Authorization':'Bearer test-b'}
    with web_client(tmp_path,**options) as (client,app):
        content=csv_bytes([{'event_subtype':'anomaly','threat_name':'SYNTHETIC'}])
        response=client.post('/api/uploads',headers=headers_a,files={'file':('synthetic.csv',content,'text/csv')})
        assert response.status_code==202
        ident=response.json()['analysis_id']
        for _ in range(1000):
            state=client.get(f'/api/jobs/{ident}',headers=headers_a).json()
            if state['state'] in ('completed','failed'): break
            time.sleep(.005)
        assert state['state']=='completed'
        assert client.post(f'/api/workspace/analyses/{ident}/save',headers=headers_b).status_code==404
        saved=client.post(f'/api/workspace/analyses/{ident}/save',headers=headers_a)
        assert saved.status_code==201,saved.text
        assert saved.json()['analysis_id']==ident
        assert client.post(f'/api/workspace/analyses/{ident}/save',headers=headers_a).status_code==200
        assert client.get('/api/workspace/analyses',headers=headers_b).json()['total']==0
        assert client.get(f'/api/workspace/analyses/{ident}',headers=headers_b).status_code==404
        assert client.delete(f'/api/workspace/analyses/{ident}',headers=headers_b).status_code==404
        assert client.get('/api/workspace/analyses').status_code==401
    with web_client(tmp_path,**options) as (client,app):
        listing=client.get('/api/workspace/analyses',headers=headers_a).json()
        assert listing['total']==1 and listing['items'][0]['analysis_id']==ident
        detail=client.get(f'/api/workspace/analyses/{ident}',headers=headers_a).json()
        assert detail['summary']['counts']['analyzed_records']==1
        items=client.get(f'/api/workspace/analyses/{ident}/items?kind=finding',headers=headers_a).json()
        assert items['total']==2 and all(x['source_record_number']==1 for x in items['items'])
        assert client.delete(f'/api/workspace/analyses/{ident}',headers={**headers_a,'origin':'https://foreign.example'}).status_code==403
        assert client.get(f'/api/workspace/analyses/{ident}',headers=headers_a).status_code==200
        assert client.delete(f'/api/workspace/analyses/{ident}',headers=headers_a).status_code==204
        assert client.get(f'/api/workspace/analyses/{ident}',headers=headers_a).status_code==404


def test_save_item_limit_is_atomic_and_anonymous_jobs_cannot_be_claimed(tmp_path,monkeypatch,owners):
    import web_api.workspace_auth as auth
    import web_api.workspace_history as history
    monkeypatch.setattr(auth,'verified_user_id',lambda authorization,url,key:str(owners[0]))
    monkeypatch.setattr(history,'MAX_ITEMS_PER_SNAPSHOT',1)
    opts={'workspace_database_url':DSN,'supabase_url':'https://example.supabase.co','supabase_publishable_key':'public-test'}
    a={'Authorization':'Bearer test-a'}
    with web_client(tmp_path,**opts) as (client,app):
        anonymous=client.post('/api/demo').json()['analysis_id']
        for _ in range(1000):
            job=client.get(f'/api/jobs/{anonymous}').json()
            if job['state'] in ('completed','failed'): break
            time.sleep(.005)
        assert job['state']=='completed'
        assert client.post(f'/api/workspace/analyses/{anonymous}/save',headers=a).status_code==404
        ident=client.post('/api/demo',headers=a).json()['analysis_id']
        for _ in range(1000):
            job=client.get(f'/api/jobs/{ident}',headers=a).json()
            if job['state'] in ('completed','failed'): break
            time.sleep(.005)
        assert job['state']=='completed'
        response=client.post(f'/api/workspace/analyses/{ident}/save',headers=a)
        assert response.status_code==413 and response.json()['error']['code']=='WORKSPACE_ITEM_LIMIT'
        assert client.get('/api/workspace/analyses',headers=a).json()['total']==0


def test_owner_history_quota_preserves_idempotent_save(tmp_path,monkeypatch,owners):
    import web_api.workspace_auth as auth
    import web_api.workspace_history as history
    monkeypatch.setattr(auth,'verified_user_id',lambda authorization,url,key:str(owners[0]))
    monkeypatch.setattr(history,'MAX_ANALYSES_PER_OWNER',1)
    opts={'workspace_database_url':DSN,'supabase_url':'https://example.supabase.co','supabase_publishable_key':'public-test'}
    a={'Authorization':'Bearer test-a'}
    with web_client(tmp_path,**opts) as (client,app):
        saved_ids=[]
        for _ in range(2):
            ident=client.post('/api/demo',headers=a).json()['analysis_id']
            for _ in range(1000):
                job=client.get(f'/api/jobs/{ident}',headers=a).json()
                if job['state'] in ('completed','failed'): break
                time.sleep(.005)
            assert job['state']=='completed'
            saved_ids.append(ident)
        assert client.post(f'/api/workspace/analyses/{saved_ids[0]}/save',headers=a).status_code==201
        response=client.post(f'/api/workspace/analyses/{saved_ids[1]}/save',headers=a)
        assert response.status_code==429 and response.json()['error']['code']=='WORKSPACE_CAPACITY'
        assert client.post(f'/api/workspace/analyses/{saved_ids[0]}/save',headers=a).status_code==200


def test_concurrent_saves_cannot_exceed_owner_quota(tmp_path,monkeypatch,owners):
    from concurrent.futures import ThreadPoolExecutor
    import web_api.workspace_auth as auth
    import web_api.workspace_history as history
    monkeypatch.setattr(auth,'verified_user_id',lambda authorization,url,key:str(owners[0]))
    monkeypatch.setattr(history,'MAX_ANALYSES_PER_OWNER',1)
    opts={'workspace_database_url':DSN,'supabase_url':'https://example.supabase.co','supabase_publishable_key':'public-test'}
    a={'Authorization':'Bearer test-a'}
    with web_client(tmp_path,**opts) as (client,app):
        ids=[]
        for _ in range(2):
            ident=client.post('/api/demo',headers=a).json()['analysis_id']
            for _ in range(1000):
                job=client.get(f'/api/jobs/{ident}',headers=a).json()
                if job['state'] in ('completed','failed'): break
                time.sleep(.005)
            assert job['state']=='completed'
            ids.append(ident)
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses=list(executor.map(lambda ident:client.post(f'/api/workspace/analyses/{ident}/save',headers=a),ids))
        assert sorted(r.status_code for r in responses)==[201,429]
        assert client.get('/api/workspace/analyses',headers=a).json()['total']==1


def test_storage_error_does_not_disclose_connection_details(tmp_path,monkeypatch,owners):
    import psycopg
    import web_api.workspace_auth as auth
    monkeypatch.setattr(auth,'verified_user_id',lambda authorization,url,key:str(owners[0]))
    def unavailable(*args,**kwargs): raise psycopg.OperationalError('sensitive connection detail')
    opts={'workspace_database_url':DSN,'supabase_url':'https://example.supabase.co','supabase_publishable_key':'public-test'}
    with monkeypatch.context() as mocked:
        mocked.setattr(psycopg,'connect',unavailable)
        with web_client(tmp_path,**opts) as (client,app):
            response=client.get('/api/workspace/analyses',headers={'Authorization':'Bearer test-a'})
            assert response.status_code==503 and response.json()['error']['code']=='WORKSPACE_UNAVAILABLE'
            assert 'sensitive connection detail' not in response.text


def test_expired_history_is_hidden_and_cleanup_physically_removes_it(owners):
    import psycopg
    from web_api.workspace_history import get_analysis, list_analyses, purge_expired
    from web_api.contracts import WebError
    ident=uuid.uuid4()
    with psycopg.connect(DSN) as db:
        db.execute('''INSERT INTO public.sli_analyses(id,owner_id,source_type,filename,status,summary,created_at,expires_at)
                      VALUES (%s,%s,'fortigate','synthetic.csv','completed','{}',now()-interval '8 days',now()-interval '1 day')''',
                   (ident,owners[0]))
        db.execute('''INSERT INTO public.sli_analysis_items(analysis_id,owner_id,kind,source_record_number,item_order,payload)
                      VALUES (%s,%s,'finding',1,0,'{}')''',(ident,owners[0]))
    assert list_analyses(DSN,str(owners[0]),0,50)['total']==0
    with pytest.raises(WebError) as error:
        get_analysis(DSN,str(owners[0]),ident.hex)
    assert error.value.status==404
    assert purge_expired(DSN,limit=100)>=1
    with psycopg.connect(DSN) as db:
        assert db.execute('SELECT count(*) FROM public.sli_analyses WHERE id=%s',(ident,)).fetchone()[0]==0
        assert db.execute('SELECT count(*) FROM public.sli_analysis_items WHERE analysis_id=%s',(ident,)).fetchone()[0]==0


def test_review_is_owner_scoped_and_survives_restart(tmp_path,monkeypatch,owners):
    import psycopg
    import web_api.workspace_auth as auth
    ident,item_id=uuid.uuid4(),uuid.uuid4()
    with psycopg.connect(DSN) as db:
        db.execute("INSERT INTO public.sli_analyses(id,owner_id,source_type,filename,status,summary) VALUES (%s,%s,'fortigate','sample.csv','completed','{}')",(ident,owners[0]))
        db.execute("INSERT INTO public.sli_analysis_items(id,analysis_id,owner_id,kind,source_record_number,item_order,payload) VALUES (%s,%s,%s,'finding',1,0,%s)",(item_id,ident,owners[0],'{"source_record_number":1}'))
    monkeypatch.setattr(auth,'verified_user_id',lambda h,u,k: str(owners[0] if h=='Bearer a' else owners[1]))
    opts={'workspace_database_url':DSN,'supabase_url':'https://example.supabase.co','supabase_publishable_key':'public-test'}
    a={'Authorization':'Bearer a'}; b={'Authorization':'Bearer b'}
    url=f'/api/workspace/analyses/{ident.hex}/items/{item_id.hex}/review'
    with web_client(tmp_path,**opts) as (client,app):
        item=client.get(f'/api/workspace/analyses/{ident.hex}/items?kind=finding',headers=a).json()['items'][0]
        assert item['workspace_item_id']==item_id.hex and item['review'] is None
        assert client.post(url,headers=b,json={'status':'reviewed','note':'other'}).status_code==404
        assert client.post(url,headers=a,json={'status':'bogus','note':'x'}).status_code==422
        assert client.post(url,headers=a,json={'status':'reviewed','note':'x'*2001}).status_code==422
        assert client.post(url,headers=a,json={'status':'reviewed','note':'\u0000'}).status_code==422
        assert client.post(url,headers=a,json={'status':'reviewed','note':None,'owner_id':str(owners[1])}).status_code==422
        assert client.post(url,headers={**a,'origin':'https://evil.example'},json={'status':'reviewed','note':'x'}).status_code==403
        saved=client.post(url,headers=a,json={'status':'investigating','note':'Check context'})
        assert saved.status_code==200 and saved.json()['status']=='investigating'
    with web_client(tmp_path,**opts) as (client,app):
        item=client.get(f'/api/workspace/analyses/{ident.hex}/items?kind=finding',headers=a).json()['items'][0]
        assert item['review']['note']=='Check context'
        assert client.post(url,headers=a,json={'status':'reviewed','note':None}).json()['status']=='reviewed'
        with psycopg.connect(DSN) as db:
            db.execute("UPDATE public.sli_analyses SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=%s",(ident,))
        assert client.post(url,headers=a,json={'status':'reviewed','note':None}).status_code==404
        with psycopg.connect(DSN) as db:
            db.execute("UPDATE public.sli_analyses SET expires_at=now()+interval '1 day' WHERE id=%s",(ident,))
        assert client.delete(f'/api/workspace/analyses/{ident.hex}',headers=a).status_code==204
        assert client.post(url,headers=a,json={'status':'reviewed','note':None}).status_code==404
