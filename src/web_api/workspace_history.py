"""Staging-only owner-scoped persistence of derived analysis snapshots.

The database connection is privileged; every query must include the verified
owner. Uploaded source CSVs are never copied to this store.
"""
from contextlib import contextmanager, ExitStack
from uuid import UUID
import json
from .contracts import WebError

MAX_ITEMS_PER_SNAPSHOT = 10000
MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024
MAX_ANALYSES_PER_OWNER = 20
KINDS = {'finding','prediction','anomaly','quality','record'}


@contextmanager
def _connection(database_url):
    if not database_url:
        raise WebError(503,'WORKSPACE_NOT_CONFIGURED','Workspace storage is not configured.')
    try:
        import psycopg
        from psycopg.conninfo import conninfo_to_dict
        from psycopg.rows import dict_row
    except ImportError as error:
        raise WebError(503,'WORKSPACE_NOT_CONFIGURED','Workspace database driver is unavailable.') from error
    try:
        config=conninfo_to_dict(database_url)
        host=config.get('host','')
        hostaddr=config.get('hostaddr','')
        local=host in {'localhost','127.0.0.1','::1'} and hostaddr in {'','127.0.0.1','::1'}
        if not host or (not local and config.get('sslmode')!='verify-full'):
            raise ValueError('remote database requires verified TLS')
    except (ValueError,psycopg.Error) as error:
        raise WebError(503,'WORKSPACE_CONFIGURATION_INVALID','Workspace database configuration is invalid.') from error
    try:
        with psycopg.connect(database_url,connect_timeout=5,row_factory=dict_row) as db:
            yield db
    except psycopg.Error as error:
        raise WebError(503,'WORKSPACE_UNAVAILABLE','Workspace storage is temporarily unavailable.') from error


def _ident(value):
    try: return UUID(value)
    except (ValueError,AttributeError,TypeError):
        raise WebError(404,'NOT_FOUND','Workspace analysis not found.')


def _public(row):
    result=dict(row)
    result['analysis_id']=result.pop('id').hex
    for key in ('created_at','expires_at'):
        result[key]=result[key].isoformat()
    return result


def save_analysis(database_url, jobs, ident, session_owner, verified_owner):
    if not database_url:
        raise WebError(503,'WORKSPACE_NOT_CONFIGURED','Workspace storage is not configured.')
    # Acquire leases before reading so deletion/expiry cannot remove source files.
    job=jobs.get(ident,session_owner,completed=True)
    collected=[]
    payload_bytes=len(json.dumps(job.result.summary,ensure_ascii=False,allow_nan=False).encode('utf-8'))
    if payload_bytes > MAX_SNAPSHOT_BYTES:
        raise WebError(413,'WORKSPACE_SIZE_LIMIT','Derived analysis is too large to save in the workspace.')
    sources=[('finding','findings_path',jobs.open_findings),('record','records_path',jobs.open_records),
             ('prediction','predictions_path',jobs.open_predictions),('anomaly','anomalies_path',jobs.open_anomalies),
             ('quality','issues_path',jobs.open_issues)]
    with ExitStack() as stack:
        readers=[(kind,stack.enter_context(opener(ident,session_owner)))
                 for kind,attr,opener in sources if getattr(job.result,attr) is not None]
        for kind,reader in readers:
            for order,item in enumerate(reader.matching()):
                if len(collected)>=MAX_ITEMS_PER_SNAPSHOT:
                    raise WebError(413,'WORKSPACE_ITEM_LIMIT','Analysis has too many derived items to save in the workspace.')
                payload_bytes += len(json.dumps(item,ensure_ascii=False,allow_nan=False).encode('utf-8'))
                if payload_bytes > MAX_SNAPSHOT_BYTES:
                    raise WebError(413,'WORKSPACE_SIZE_LIMIT','Derived analysis is too large to save in the workspace.')
                collected.append((kind,order,item))
        with _connection(database_url) as db:
            from psycopg.types.json import Jsonb
            # Serialize quota checks for this owner even across multiple workers.
            db.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))',(verified_owner,))
            owned=db.execute('SELECT id FROM public.sli_analyses WHERE id=%s AND owner_id=%s AND expires_at>now()',
                (_ident(ident),UUID(verified_owner))).fetchone()
            if owned is not None:
                return False
            # This is opportunistic cleanup, not a substitute for a scheduled purge.
            db.execute('DELETE FROM public.sli_analyses WHERE owner_id=%s AND expires_at<=now()', (UUID(verified_owner),))
            count=db.execute('SELECT count(*) AS n FROM public.sli_analyses WHERE owner_id=%s', (UUID(verified_owner),)).fetchone()['n']
            if count>=MAX_ANALYSES_PER_OWNER:
                raise WebError(429,'WORKSPACE_CAPACITY','Workspace history is full. Delete an analysis and try again.')
            row=db.execute('''INSERT INTO public.sli_analyses(id,owner_id,source_type,filename,status,summary)
                VALUES (%s,%s,%s,%s,'completed',%s) ON CONFLICT (id) DO NOTHING RETURNING id''',
                (_ident(ident),UUID(verified_owner),job.source_type,job.filename,Jsonb(job.result.summary))).fetchone()
            if row is None:
                owned=db.execute('SELECT id FROM public.sli_analyses WHERE id=%s AND owner_id=%s AND expires_at>now()',
                    (_ident(ident),UUID(verified_owner))).fetchone()
                if owned is None: raise WebError(409,'WORKSPACE_CONFLICT','Analysis could not be saved.')
                return False
            with db.cursor() as cursor:
                cursor.executemany('''INSERT INTO public.sli_analysis_items
                    (analysis_id,owner_id,kind,source_record_number,item_order,payload)
                    VALUES (%s,%s,%s,%s,%s,%s)''',
                    [(_ident(ident),UUID(verified_owner),kind,item['source_record_number'],order,Jsonb(item))
                     for kind,order,item in collected])
        return True


def list_analyses(database_url, owner, offset, limit):
    with _connection(database_url) as db:
        total=db.execute('SELECT count(*) AS n FROM public.sli_analyses WHERE owner_id=%s AND expires_at>now()', (UUID(owner),)).fetchone()['n']
        rows=db.execute('''SELECT id,source_type,filename,status,created_at,expires_at FROM public.sli_analyses
            WHERE owner_id=%s AND expires_at>now() ORDER BY created_at DESC,id DESC OFFSET %s LIMIT %s''',
            (UUID(owner),offset,limit)).fetchall()
        return {'items':[_public(row) for row in rows],'total':total,'offset':offset,'limit':limit}


def get_analysis(database_url, owner, ident):
    with _connection(database_url) as db:
        row=db.execute('''SELECT id,source_type,filename,status,created_at,expires_at,summary FROM public.sli_analyses
            WHERE id=%s AND owner_id=%s AND expires_at>now()''',(_ident(ident),UUID(owner))).fetchone()
        if row is None: raise WebError(404,'NOT_FOUND','Workspace analysis not found.')
        return _public(row)


def list_items(database_url, owner, ident, kind, offset, limit):
    if kind not in KINDS: raise WebError(422,'INVALID_FILTER','Choose a supported workspace item kind.',['kind'])
    with _connection(database_url) as db:
        row=db.execute('SELECT id FROM public.sli_analyses WHERE id=%s AND owner_id=%s AND expires_at>now()',(_ident(ident),UUID(owner))).fetchone()
        if row is None: raise WebError(404,'NOT_FOUND','Workspace analysis not found.')
        total=db.execute('SELECT count(*) AS n FROM public.sli_analysis_items WHERE analysis_id=%s AND owner_id=%s AND kind=%s',(_ident(ident),UUID(owner),kind)).fetchone()['n']
        rows=db.execute('''SELECT i.id,i.payload,r.status,r.note,r.updated_at FROM public.sli_analysis_items AS i
            LEFT JOIN public.sli_analysis_reviews AS r ON r.analysis_id=i.analysis_id AND r.owner_id=i.owner_id AND r.item_id=i.id
            WHERE i.analysis_id=%s AND i.owner_id=%s AND i.kind=%s ORDER BY i.item_order OFFSET %s LIMIT %s''',
            (_ident(ident),UUID(owner),kind,offset,limit)).fetchall()
        items=[]
        for row in rows:
            item=dict(row['payload'])
            item['workspace_item_id']=row['id'].hex
            item['review']=None if row['status'] is None else {'status':row['status'],'note':row['note'],'updated_at':row['updated_at'].isoformat()}
            items.append(item)
        return {'items':items,'total':total,'offset':offset,'limit':limit}


def save_review(database_url, owner, ident, item_id, status, note):
    with _connection(database_url) as db:
        row=db.execute('''INSERT INTO public.sli_analysis_reviews(analysis_id,owner_id,item_id,status,note)
            SELECT i.analysis_id,i.owner_id,i.id,%s,%s FROM public.sli_analysis_items AS i
            JOIN public.sli_analyses AS a ON a.id=i.analysis_id AND a.owner_id=i.owner_id
            WHERE i.analysis_id=%s AND i.owner_id=%s AND i.id=%s AND a.expires_at>now()
            ON CONFLICT (analysis_id,owner_id,item_id) DO UPDATE
            SET status=EXCLUDED.status,note=EXCLUDED.note,updated_at=now()
            RETURNING status,note,updated_at''',
            (status,note,_ident(ident),UUID(owner),_ident(item_id))).fetchone()
        if row is None: raise WebError(404,'NOT_FOUND','Workspace item not found.')
        return {'status':row['status'],'note':row['note'],'updated_at':row['updated_at'].isoformat()}


def delete_analysis(database_url, owner, ident):
    with _connection(database_url) as db:
        row=db.execute('''DELETE FROM public.sli_analyses WHERE id=%s AND owner_id=%s
            AND expires_at>now() RETURNING id''',(_ident(ident),UUID(owner))).fetchone()
        if row is None: raise WebError(404,'NOT_FOUND','Workspace analysis not found.')


def purge_expired(database_url, limit=100):
    """Delete one bounded batch; foreign keys cascade to items and reviews."""
    if not 1 <= limit <= 1000:
        raise ValueError('cleanup batch size must be between 1 and 1000')
    with _connection(database_url) as db:
        rows=db.execute('''WITH expired AS (
            SELECT id FROM public.sli_analyses WHERE expires_at<=now()
            ORDER BY expires_at LIMIT %s FOR UPDATE SKIP LOCKED
        ) DELETE FROM public.sli_analyses WHERE id IN (SELECT id FROM expired)
          RETURNING id''',(limit,)).fetchall()
        return len(rows)
