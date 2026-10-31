"""Separate web MVP API; run with uvicorn web_api.app:create_app --factory."""
from contextlib import asynccontextmanager
from pathlib import Path
import hashlib
import hmac
import os
import secrets
import asyncio
from typing import Literal

from fastapi import FastAPI, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from fastapi.exceptions import RequestValidationError
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import FileResponse, JSONResponse, Response, StreamingResponse
from starlette.staticfiles import StaticFiles
from starlette.formparsers import MultiPartException

from detection.rules import ACTIVE_RULES
from parsers.fortigate import BASELINE_FORTIGATE_FIELDS
from .contracts import WebError, WebSettings
from .exports import export_chunks
from .jobs import JobStore
from .sample import sample_csv
from .summary import SEVERITIES
from .sources import sources_schema,validate_source


class WorkspaceReview(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)
    status: Literal['unreviewed','investigating','reviewed']
    note: str | None = Field(default=None,max_length=2000)

    @field_validator('note')
    @classmethod
    def note_without_nul(cls, value):
        if value is not None and '\x00' in value:
            raise ValueError('note contains an invalid character')
        return value


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes, timeout):
        self.app, self.max_bytes, self.timeout = app, max_bytes, timeout

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') != 'POST':
            return await self.app(scope,receive,send)
        headers = dict(scope.get('headers',[]))
        try:
            length = int(headers.get(b'content-length', b'0'))
        except ValueError:
            length = self.max_bytes + 1
        if length > self.max_bytes or length < 0:
            response = JSONResponse({'error':{'code':'REQUEST_TOO_LARGE','message':'Request exceeds the upload limit.','fields':[]}},status_code=413)
            return await response(scope,receive,send)
        used = 0
        deadline = asyncio.get_running_loop().time() + self.timeout
        async def limited_receive():
            nonlocal used
            try:
                remaining = max(0,deadline-asyncio.get_running_loop().time())
                message = await asyncio.wait_for(receive(),timeout=remaining)
            except TimeoutError as error:
                scope['sli_body_error'] = WebError(408,'UPLOAD_TIMEOUT','Upload timed out. Retry with a stable connection.')
                # The multipart parser closes all open spools on this exception.
                raise MultiPartException('Upload timed out.') from error
            if message['type'] == 'http.request':
                used += len(message.get('body',b''))
                if used > self.max_bytes:
                    scope['sli_body_error'] = WebError(413,'REQUEST_TOO_LARGE','Request exceeds the upload limit.')
                    raise MultiPartException('Request exceeds the upload limit.')
            return message
        await self.app(scope,limited_receive,send)


class FindingsResponse(StreamingResponse):
    """Own the read lease even if headers fail or a client stops downloading."""
    def __init__(self, content, *, reader, **kwargs):
        super().__init__(content,**kwargs)
        self.reader = reader

    async def __call__(self, scope, receive, send):
        try:
            async with asyncio.timeout(30):
                await super().__call__(scope,receive,send)
        finally:
            self.reader.close()


def create_app(settings: WebSettings | None = None) -> FastAPI:
    settings = settings or WebSettings.from_env()
    jobs = JobStore(settings)
    cookie_key = secrets.token_bytes(32)

    @asynccontextmanager
    async def lifespan(app):
        jobs.start()
        try:
            yield
        finally:
            jobs.close()

    app = FastAPI(title='Security Log Intelligence Web API',version='1.0',lifespan=lifespan,docs_url='/api/docs',openapi_url='/api/openapi.json',redoc_url=None)
    app.state.jobs = jobs
    app.state.settings = settings
    app.add_middleware(BodyLimitMiddleware,max_bytes=settings.max_file_bytes+64*1024,timeout=settings.upload_timeout_seconds)
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=list(settings.allowed_hosts),www_redirect=False)

    def sign(value):
        return hmac.new(cookie_key,value.encode('ascii'),hashlib.sha256).hexdigest()

    @app.middleware('http')
    async def session_and_safety(request, call_next):
        if request.method in {'POST','DELETE'}:
            origin = request.headers.get('origin')
            expected = f'{request.url.scheme}://{request.url.netloc}'
            if request.headers.get('sec-fetch-site') == 'cross-site' or (origin and origin != expected):
                return error_response(WebError(403,'ORIGIN_REJECTED','Use the application from its own website.'))
        cookie = request.cookies.get('sli_session','')
        token, sep, signature = cookie.partition('.')
        valid = len(token) == 64 and all(c in '0123456789abcdef' for c in token) and sep and hmac.compare_digest(signature,sign(token))
        if not valid:
            token = secrets.token_hex(32)
        # An authenticated analysis is scoped to both this browser session and
        # the provider-verified user. Never trust a client-supplied user id.
        request.state.workspace_user_id = None
        authorization = request.headers.get('authorization') if request.url.path.startswith('/api/') else None
        if authorization:
            from .workspace_auth import verified_user_id
            try:
                request.state.workspace_user_id = await asyncio.to_thread(
                    verified_user_id,authorization,settings.supabase_url,settings.supabase_publishable_key)
            except WebError as error:
                return error_response(error)
        owner_material = token if request.state.workspace_user_id is None else f'workspace:v1:{token}:{request.state.workspace_user_id}'
        request.state.owner = hashlib.sha256(owner_material.encode()).hexdigest()
        response = await call_next(request)
        if not valid or (request.method == 'POST' and response.status_code == 202):
            response.set_cookie('sli_session',token+'.'+sign(token),httponly=True,secure=settings.secure_cookies,
                                samesite='strict',max_age=settings.retention_seconds,path='/')
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    def error_response(error):
        headers = {'Retry-After':'5'} if error.code == 'BUSY' else None
        return JSONResponse({'error':error.payload()},status_code=error.status,headers=headers)

    @app.exception_handler(WebError)
    async def web_error(request, error):
        return error_response(error)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        return error_response(WebError(422,'INVALID_REQUEST','Request parameters are invalid.'))

    @app.exception_handler(HTTPException)
    async def http_error(request, error):
        return error_response(WebError(error.status_code,'HTTP_ERROR','The requested resource or operation is unavailable.'))

    @app.get('/healthz')
    def healthz():
        return {'status':'ok','engine':'rules','frontend_ready':(settings.frontend_dir/'index.html').is_file()}

    @app.get('/api/evaluation')
    def evaluation():
        from .evaluation import historical_evaluation
        return historical_evaluation()

    @app.get('/api/workspace/me')
    def workspace_me(request: Request):
        from .workspace_auth import verified_user_id
        user_id=request.state.workspace_user_id or verified_user_id(request.headers.get('authorization'),settings.supabase_url,settings.supabase_publishable_key)
        return {'user_id':user_id}

    def workspace_user(request):
        from .workspace_auth import verified_user_id
        return request.state.workspace_user_id or verified_user_id(
            request.headers.get('authorization'),settings.supabase_url,settings.supabase_publishable_key)

    def workspace_pagination(request, allowed):
        pairs=list(request.query_params.multi_items())
        if any(key not in allowed for key,value in pairs) or len({key for key,value in pairs})!=len(pairs):
            raise WebError(422,'INVALID_FILTER','Unknown or duplicate query parameter.')
        try:
            offset=int(request.query_params.get('offset','0'))
            limit=int(request.query_params.get('limit','50'))
            if offset<0 or not 1<=limit<=100: raise ValueError
        except ValueError:
            raise WebError(422,'INVALID_PAGINATION','offset must be nonnegative and limit must be 1–100.')
        return offset,limit

    @app.post('/api/workspace/analyses/{analysis_id}/save')
    def workspace_save(analysis_id: str, request: Request):
        from .workspace_history import save_analysis
        owner=workspace_user(request)
        created=save_analysis(settings.workspace_database_url,jobs,analysis_id,request.state.owner,owner)
        return JSONResponse({'analysis_id':analysis_id,'created':created},status_code=201 if created else 200)

    @app.get('/api/workspace/analyses')
    def workspace_list(request: Request):
        from .workspace_history import list_analyses
        owner=workspace_user(request)
        offset,limit=workspace_pagination(request,{'offset','limit'})
        return list_analyses(settings.workspace_database_url,owner,offset,limit)

    @app.get('/api/workspace/analyses/{analysis_id}')
    def workspace_detail(analysis_id: str, request: Request):
        from .workspace_history import get_analysis
        return get_analysis(settings.workspace_database_url,workspace_user(request),analysis_id)

    @app.get('/api/workspace/analyses/{analysis_id}/items')
    def workspace_items(analysis_id: str, request: Request):
        from .workspace_history import list_items
        owner=workspace_user(request)
        offset,limit=workspace_pagination(request,{'kind','offset','limit'})
        return list_items(settings.workspace_database_url,owner,analysis_id,request.query_params.get('kind',''),offset,limit)

    @app.delete('/api/workspace/analyses/{analysis_id}',status_code=204)
    def workspace_delete(analysis_id: str, request: Request):
        from .workspace_history import delete_analysis
        delete_analysis(settings.workspace_database_url,workspace_user(request),analysis_id)
        return Response(status_code=204)

    @app.post('/api/workspace/analyses/{analysis_id}/items/{item_id}/review')
    def workspace_review(analysis_id: str, item_id: str, review: WorkspaceReview, request: Request):
        from .workspace_history import save_review
        return save_review(settings.workspace_database_url,workspace_user(request),analysis_id,item_id,review.status,review.note)

    @app.get('/api/schema')
    def schema():
        return {'source_type':'fortigate','required_columns':list(BASELINE_FORTIGATE_FIELDS),
                'max_file_bytes':settings.max_file_bytes,'max_records':settings.max_records,
                'retention_seconds':settings.retention_seconds,'engine':'rules','severities':list(SEVERITIES),
                'rules':[{'rule_id':r.metadata.rule_id,'name':r.metadata.name,'severity':r.metadata.severity} for r in ACTIVE_RULES],
                'chat_available':False,'sources':sources_schema()}

    @app.get('/api/sample')
    def sample(source_type: str = 'fortigate'):
        validate_source(source_type)
        return Response(sample_csv(source_type),media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="synthetic-{source_type}.csv"'})

    def accepted(job):
        return JSONResponse({'analysis_id':job.analysis_id,'state':'queued','status_url':f'/api/jobs/{job.analysis_id}'},status_code=202)

    @app.post('/api/uploads')
    async def upload(request: Request):
        # Reserve before multipart parsing so concurrent uploads cannot fill spools/queues.
        job = jobs.reserve(request.state.owner,'upload.csv',False)
        try:
            async with request.form(max_files=1,max_fields=1,max_part_size=64) as form:
                items = list(form.multi_items())
                keys = [key for key,value in items]
                if keys.count('file') != 1 or keys.count('source_type') > 1 or any(key not in {'file','source_type'} for key in keys):
                    raise WebError(422,'INVALID_MULTIPART','Choose one file and optionally one source_type.')
                file = form.get('file')
                if not isinstance(file,UploadFile):
                    raise WebError(422,'FILE_REQUIRED','Choose one CSV file in the file field.')
                selected = form.get('source_type','fortigate')
                if not isinstance(selected,str):
                    raise WebError(422,'UNSUPPORTED_SOURCE','source_type must be text.',['source_type'])
                job.source_type = validate_source(selected)
                filename = (file.filename or '').replace('\\','/').split('/')[-1]
                if not filename.lower().endswith('.csv'):
                    raise WebError(422,'UNSUPPORTED_FILE','Choose a UTF-8 .csv file matching the supported schema.')
                # Filename is metadata only and is never used as a path.
                job.filename = ''.join(c for c in filename if ord(c)>=32)[:200] or 'upload.csv'
                used = 0
                with (jobs.directory(job.analysis_id)/'source.csv').open('xb') as target:
                    while chunk := await file.read(64*1024):
                        used += len(chunk)
                        if used > settings.max_file_bytes:
                            raise WebError(413,'FILE_TOO_LARGE',f'File exceeds {settings.max_file_bytes:,} bytes.')
                        target.write(chunk)
            jobs.submit(job)
            return accepted(job)
        except WebError:
            jobs.abandon(job)
            raise
        except HTTPException as error:
            jobs.abandon(job)
            if 'sli_body_error' in request.scope:
                raise request.scope['sli_body_error'] from error
            raise WebError(422,'INVALID_MULTIPART','Choose one CSV file and optionally one source_type.') from error
        except BaseException:
            jobs.abandon(job)
            raise

    @app.post('/api/demo')
    async def demo(request: Request, source_type: str = 'fortigate'):
        validate_source(source_type)
        job = jobs.reserve(request.state.owner,f'synthetic-{source_type}.csv',True,source_type=source_type)
        try:
            (jobs.directory(job.analysis_id)/'source.csv').write_bytes(sample_csv(source_type))
            jobs.submit(job)
        except BaseException:
            jobs.abandon(job)
            raise
        return accepted(job)

    @app.get('/api/jobs/{analysis_id}')
    def status(analysis_id: str, request: Request):
        return jobs.status(analysis_id,request.state.owner)

    @app.get('/api/analyses/{analysis_id}/summary')
    def summary(analysis_id: str, request: Request):
        return jobs.get(analysis_id,request.state.owner,completed=True).result.summary

    @app.delete('/api/analyses/{analysis_id}', status_code=204)
    def delete_analysis(analysis_id: str, request: Request):
        jobs.delete(analysis_id,request.state.owner)
        return Response(status_code=204)

    def filters(request, *, export=False):
        allowed = {'severity','rule_id','format'} if export else {'severity','rule_id','offset','limit','source_record_number'}
        pairs = list(request.query_params.multi_items())
        if any(k not in allowed for k,v in pairs) or len({k for k,v in pairs}) != len(pairs):
            raise WebError(422,'INVALID_FILTER','Unknown or duplicate query parameter.')
        severity = request.query_params.get('severity','')
        rule_id = request.query_params.get('rule_id','')
        if severity and severity not in SEVERITIES:
            raise WebError(422,'INVALID_FILTER','Choose a severity from the schema.',['severity'])
        if rule_id and rule_id not in {r.metadata.rule_id for r in ACTIVE_RULES}:
            raise WebError(422,'INVALID_FILTER','Choose an active rule from the schema.',['rule_id'])
        selected = {'severity':severity,'rule_id':rule_id}
        if not export and 'source_record_number' in request.query_params:
            value = request.query_params['source_record_number']
            if not value.isascii() or not value.isdecimal() or len(value)>9 or int(value)<1:
                raise WebError(422,'INVALID_FILTER','source_record_number must be a positive integer.',['source_record_number'])
            selected['source_record_number'] = int(value)
        return selected

    @app.get('/api/analyses/{analysis_id}/records')
    def records(analysis_id: str, request: Request):
        return paginated(analysis_id,request,jobs.open_records)

    @app.get('/api/analyses/{analysis_id}/issues')
    def issues(analysis_id: str, request: Request):
        return paginated(analysis_id,request,jobs.open_issues)

    @app.get('/api/analyses/{analysis_id}/predictions')
    def predictions(analysis_id: str, request: Request):
        return paginated(analysis_id,request,jobs.open_predictions)

    @app.get('/api/analyses/{analysis_id}/anomalies')
    def anomalies(analysis_id: str, request: Request):
        return paginated(analysis_id,request,jobs.open_anomalies)

    def paginated(analysis_id: str, request: Request, opener):
        pairs = list(request.query_params.multi_items())
        if any(key not in {'offset','limit'} for key,value in pairs) or len({key for key,value in pairs}) != len(pairs):
            raise WebError(422,'INVALID_FILTER','Records accept only offset and limit, without duplicates.')
        try:
            offset = int(request.query_params.get('offset','0'))
            limit = int(request.query_params.get('limit','50'))
            if offset < 0 or not 1 <= limit <= 100: raise ValueError
        except ValueError:
            raise WebError(422,'INVALID_PAGINATION','offset must be nonnegative and limit must be 1–100.')
        items,total = [],0
        with opener(analysis_id,request.state.owner) as reader:
            for item in reader.matching():
                if offset <= total < offset+limit: items.append(item)
                total += 1
        return {'items':items,'total':total,'offset':offset,'limit':limit}

    @app.get('/api/analyses/{analysis_id}/findings')
    def findings(analysis_id: str, request: Request):
        job = jobs.get(analysis_id,request.state.owner,completed=True)
        selected = filters(request)
        try:
            offset = int(request.query_params.get('offset','0'))
            limit = int(request.query_params.get('limit','50'))
            if offset < 0 or not 1<=limit<=100:
                raise ValueError
        except ValueError:
            raise WebError(422,'INVALID_PAGINATION','offset must be nonnegative and limit must be 1–100.')
        items,total = [],0
        with jobs.open_findings(analysis_id,request.state.owner) as reader:
            for item in reader.matching(**selected):
                if offset<=total<offset+limit:
                    items.append(item)
                total += 1
        return {'items':items,'total':total,'offset':offset,'limit':limit}

    @app.get('/api/analyses/{analysis_id}/findings/{finding_id}')
    def detail(analysis_id: str, finding_id: str, request: Request):
        job = jobs.get(analysis_id,request.state.owner,completed=True)
        with jobs.open_findings(analysis_id,request.state.owner) as reader:
            for item in reader.matching():
                if item['finding_id'] == finding_id:
                    return item
        raise WebError(404,'NOT_FOUND','Finding not found in this analysis.')

    @app.get('/api/analyses/{analysis_id}/export')
    def export(analysis_id: str, request: Request):
        job = jobs.get(analysis_id,request.state.owner,completed=True)
        selected = filters(request,export=True)
        format = request.query_params.get('format')
        if format not in {'json','csv'}:
            raise WebError(422,'INVALID_FORMAT','Choose format=json or format=csv.',['format'])
        reader = jobs.open_findings(analysis_id,request.state.owner)
        chunks = export_chunks(reader.matching(**selected),format)
        return FindingsResponse(chunks,reader=reader,media_type='application/json' if format=='json' else 'text/csv',
                                 headers={'Content-Disposition':f'attachment; filename="findings-{analysis_id}.{format}"'})

    # Reserve API namespaces so SPA routing cannot turn JSON errors into HTML.
    @app.get('/api')
    @app.get('/api/{unknown_path:path}')
    def unknown_api(unknown_path: str = ''):
        raise WebError(404,'NOT_FOUND','API endpoint not found.')

    if (settings.frontend_dir/'assets').is_dir():
        app.mount('/assets',StaticFiles(directory=settings.frontend_dir/'assets'),name='assets')

    @app.get('/{page_path:path}',include_in_schema=False)
    def frontend(page_path: str):
        if any(part.startswith('.') for part in page_path.split('/')) or page_path.startswith(('api/','assets/')):
            raise WebError(404,'NOT_FOUND','Resource not found.')
        index = settings.frontend_dir/'index.html'
        if not index.is_file():
            raise WebError(503,'FRONTEND_NOT_BUILT','Backend is available; build the frontend in web/ first.')
        return FileResponse(index,headers={'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"})

    return app
