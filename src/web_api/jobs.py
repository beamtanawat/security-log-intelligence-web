"""Single-worker bounded jobs with session ownership, expiry and disk cleanup."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from threading import Event, RLock, Thread
from collections import Counter
import json
import re
import secrets
import shutil
from .contracts import AnalysisResult, WebError, WebSettings
from .pipeline import analyze_csv
from .summary import iso_time

ID_PATTERN = re.compile(r'[0-9a-f]{32}')


@dataclass
class Job:
    analysis_id: str
    owner: str
    filename: str
    is_demo: bool
    created_at: float
    expires_at: float
    source_type: str = 'fortigate'
    state: str = 'queued'
    stage: str | None = 'validating'
    error: dict | None = None
    result: AnalysisResult | None = None


class JobStore:
    def __init__(self, settings: WebSettings):
        self.settings = settings
        self.data_dir = settings.data_dir
        self._lock = RLock()
        self._readers = Counter()
        self._jobs = {}
        self._tombstones = {}
        self._busy = None
        self._executor = ThreadPoolExecutor(max_workers=1,thread_name_prefix='sli-analysis')
        self._stop = Event()

    def start(self):
        self.data_dir.mkdir(parents=True,exist_ok=True,mode=0o700)
        # Dedicated upload root; only our own ID-shaped directories are removed.
        for child in self.data_dir.iterdir():
            if ID_PATTERN.fullmatch(child.name) and child.is_dir() and not child.is_symlink():
                shutil.rmtree(child)
        self._cleaner = Thread(target=self._cleanup_loop,daemon=True,name='sli-expiry')
        self._cleaner.start()

    def close(self):
        self._stop.set()
        self._cleaner.join(timeout=1)
        self._executor.shutdown(wait=True,cancel_futures=True)
        with self._lock:
            for ident in self._jobs:
                shutil.rmtree(self.directory(ident),ignore_errors=True)
            self._jobs.clear()

    def _cleanup_loop(self):
        while not self._stop.wait(30):
            self.cleanup()

    def directory(self, analysis_id: str) -> Path:
        if not ID_PATTERN.fullmatch(analysis_id):
            raise WebError(404,'NOT_FOUND','Analysis not found.')
        return self.data_dir / analysis_id

    def cleanup(self):
        with self._lock:
            self._expire_locked()

    def _expire_locked(self):
        now = self.settings.clock()
        for ident, job in list(self._jobs.items()):
            if now >= job.expires_at and ident != self._busy and not self._readers[ident]:
                shutil.rmtree(self.directory(ident),ignore_errors=True)
                self._tombstones[ident] = (job.owner, now + 3600)
                del self._jobs[ident]
        self._tombstones = {i:t for i,t in self._tombstones.items() if t[1] > now}
        # Bound metadata even if the service is busy for days.
        while len(self._tombstones) > 256:
            self._tombstones.pop(next(iter(self._tombstones)))

    def reserve(self, owner: str, filename: str, is_demo: bool, source_type: str = 'fortigate') -> Job:
        with self._lock:
            self._expire_locked()
            if self._busy is not None or len(self._jobs) >= self.settings.max_retained_jobs:
                raise WebError(429,'BUSY','Analysis capacity is full. Wait for the current job or expiry, then retry.')
            ident = secrets.token_hex(16)
            now = self.settings.clock()
            job = Job(ident,owner,filename,is_demo,now,now+self.settings.retention_seconds,source_type=source_type)
            self.directory(ident).mkdir(mode=0o700)
            self._jobs[ident] = job
            self._busy = ident
            return job

    def abandon(self, job: Job):
        with self._lock:
            self._jobs.pop(job.analysis_id,None)
            shutil.rmtree(self.directory(job.analysis_id),ignore_errors=True)
            if self._busy == job.analysis_id:
                self._busy = None

    def submit(self, job: Job):
        self._executor.submit(self._run,job)

    def _run(self, job: Job):
        try:
            self._set_stage(job,'validating')
            result = analyze_csv(self.directory(job.analysis_id)/'source.csv',max_records=self.settings.max_records,source_type=job.source_type,
                                 stage=lambda value:self._set_stage(job,value))
            if job.source_type == 'unsw_nb15':
                from dataclasses import replace
                from .predictions import run_predictions
                try:
                    prediction_path, inference = run_predictions(result.records_path,self.settings.unsw_model_dir,stage=lambda value:self._set_stage(job,value))
                    result = replace(result,predictions_path=prediction_path)
                    result.summary['inference'] = inference
                    result.summary['capabilities'].update(predictions=True,model_inference=True)
                    result.summary['summary']['text'] = result.summary['summary']['text'].replace('No attack detection, model accuracy or F1 is computed.', 'Model predictions are available separately; this upload has not been evaluated for accuracy or F1.')
                except Exception as error:
                    if isinstance(error,WebError) and error.code == 'EXPIRED':
                        raise
                    public = error if isinstance(error,WebError) else WebError(503,'INFERENCE_FAILED','Model inference could not be completed.')
                    result.summary['inference'] = {'available':False,'reason':public.message,'error_code':public.code}
                    result.summary['capabilities'].update(predictions=False,model_inference=False)
            if job.source_type == 'fortigate':
                from dataclasses import replace
                from .anomalies import run_anomalies
                try:
                    anomaly_path, inference = run_anomalies(self.directory(job.analysis_id)/'source.csv',self.settings.fortigate_model_dir,stage=lambda value:self._set_stage(job,value))
                    result = replace(result,anomalies_path=anomaly_path)
                    result.summary['anomaly_inference'] = inference
                    result.summary['capabilities']['anomalies'] = True
                    result.summary['inference']['reason'] = 'No attack classifier is configured; anomaly scores are reported separately.'
                except Exception as error:
                    if isinstance(error,WebError) and error.code == 'EXPIRED': raise
                    public = error if isinstance(error,WebError) else WebError(503,'INFERENCE_FAILED','Anomaly inference could not be completed.')
                    result.summary['anomaly_inference'] = {'available':False,'reason':public.message,'error_code':public.code}
                    result.summary['capabilities']['anomalies'] = False
            with self._lock:
                result.summary.update(analysis_id=job.analysis_id,filename=job.filename,is_demo=job.is_demo,
                                      engine='rules' if job.source_type=='fortigate' else 'profile',created_at=iso_time(job.created_at),expires_at=iso_time(job.expires_at))
                job.result = result
                job.state = 'completed'
                job.stage = None
        except Exception as error:
            public = error if isinstance(error,WebError) else WebError(500,'ANALYSIS_FAILED','Analysis could not be completed. Verify the CSV schema and try again.')
            with self._lock:
                job.state, job.stage, job.error = 'failed', None, public.payload()
            for name in ('findings.jsonl','issues.jsonl','records.jsonl','predictions.jsonl','anomalies.jsonl'):
                (self.directory(job.analysis_id)/name).unlink(missing_ok=True)
        finally:
            with self._lock:
                self._busy = None
                self._expire_locked()

    def _set_stage(self, job, stage):
        with self._lock:
            job.state,job.stage = 'running',stage
        if self.settings.clock() >= job.expires_at:
            raise WebError(410,'EXPIRED','Analysis expired. Upload the file again.')

    def get(self, ident: str, owner: str, *, completed: bool = False) -> Job:
        self.directory(ident)  # syntax validation before lookup
        with self._lock:
            self._expire_locked()
            tombstone = self._tombstones.get(ident)
            if tombstone and tombstone[0] == owner:
                raise WebError(410,'EXPIRED','Analysis expired. Upload the file again.')
            job = self._jobs.get(ident)
            if job is None or job.owner != owner:
                raise WebError(404,'NOT_FOUND','Analysis not found.')
            if self.settings.clock() >= job.expires_at:
                raise WebError(410,'EXPIRED','Analysis expired. Upload the file again.')
            if completed and job.state != 'completed':
                raise WebError(409,'NOT_READY','Analysis is not completed. Check its status first.')
            return job

    def open_records(self, ident: str, owner: str):
        return self._open_result(ident,owner,'records_path')

    def open_predictions(self, ident: str, owner: str):
        with self._lock:
            job = self.get(ident,owner,completed=True)
            if job.source_type != 'unsw_nb15':
                raise WebError(404,'UNSUPPORTED_PANEL','This source does not provide predictions.')
            if job.result.predictions_path is None:
                inference = job.result.summary['inference']
                raise WebError(503,inference.get('error_code','INFERENCE_FAILED'),inference['reason'])
            return self._open_result(ident,owner,'predictions_path')

    def open_anomalies(self, ident: str, owner: str):
        with self._lock:
            job = self.get(ident,owner,completed=True)
            if job.source_type != 'fortigate':
                raise WebError(404,'UNSUPPORTED_PANEL','This source does not provide anomaly scores.')
            if job.result.anomalies_path is None:
                inference=job.result.summary['anomaly_inference']
                raise WebError(503,inference.get('error_code','INFERENCE_FAILED'),inference['reason'])
            return self._open_result(ident,owner,'anomalies_path')

    def open_findings(self, ident: str, owner: str):
        return self._open_result(ident,owner,'findings_path')

    def _open_result(self, ident: str, owner: str, attribute: str):
        """Authorize and open atomically; cleanup waits for this bounded response."""
        with self._lock:
            job = self.get(ident,owner,completed=True)
            path = getattr(job.result,attribute)
            if path is None:
                raise WebError(404,'UNSUPPORTED_PANEL','This source does not provide this record view.')
            handle = path.open(encoding='utf-8')
            self._readers[ident] += 1
            return FindingsReader(handle,self,ident)

    def status(self, ident: str, owner: str):
        job = self.get(ident,owner)
        with self._lock:
            return {'analysis_id':ident,'state':job.state,'stage':job.stage,'error':job.error,'expires_at':iso_time(job.expires_at)}


class FindingsReader:
    """An owned read lease, closed idempotently on response completion/disconnect."""
    def __init__(self, handle, store, ident):
        self.handle, self.store, self.ident = handle, store, ident
        self.closed = False

    def matching(self, *, severity='', rule_id=''):
        for line in self.handle:
            item = json.loads(line)
            if (not severity or item['severity'] == severity) and (not rule_id or item['rule_id'] == rule_id):
                yield item

    def close(self):
        with self.store._lock:
            if not self.closed:
                self.handle.close()
                self.closed = True
                self.store._readers[self.ident] -= 1
                if not self.store._readers[self.ident]:
                    del self.store._readers[self.ident]
                self.store._expire_locked()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
