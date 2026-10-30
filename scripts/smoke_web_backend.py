"""Run a bounded synthetic smoke check against a user-owned backend URL."""
import argparse
import csv
import io
import json
import time
import httpx


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run_smoke(client, *, timeout_seconds=30):
    def check(response, expected, step):
        require(response.status_code == expected, f'{step}: expected HTTP {expected}, got {response.status_code}')
        return response

    def wait_job(ident):
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            data = check(client.get(f'/api/jobs/{ident}'),200,'job status').json()
            if data['state'] in {'completed','failed'}:
                return data
            time.sleep(.05)
        raise RuntimeError('Job did not finish within the smoke-check deadline')

    health = check(client.get('/healthz'),200,'health').json()
    schema = check(client.get('/api/schema'),200,'schema').json()
    require(schema['engine']=='rules' and not schema['chat_available'],'Unexpected engine/chat contract')
    sample = check(client.get('/api/sample'),200,'synthetic sample').content
    accepted = check(client.post('/api/demo'),202,'demo').json()
    ident = accepted['analysis_id']
    require(wait_job(ident)['state']=='completed','Synthetic demo failed')
    prefix = f'/api/analyses/{ident}'
    summary = check(client.get(prefix+'/summary'),200,'summary').json()
    counts = summary['counts']
    require(counts['input_records']==24 and counts['findings']==7,'Synthetic sample totals do not reconcile')
    require(summary['is_demo'] and summary['summary']['mode']=='deterministic','Demo/summary provenance missing')
    findings = check(client.get(prefix+'/findings'),200,'findings').json()
    require(findings['total']==7,'Findings total mismatch')
    first = findings['items'][0]
    detail = check(client.get(prefix+'/findings/'+first['finding_id']),200,'evidence detail').json()
    require(bool(detail['evidence']) and bool(detail['uncertainties']),'Missing evidence or interpretation limits')
    require(check(client.get(prefix+'/findings?severity=HIGH'),200,'severity filter').json()['total']==0,'Unexpected high-severity classification')
    exported = check(client.get(prefix+'/export?format=json'),200,'JSON export').json()
    require(len(exported)==7,'JSON export mismatch')
    csv_export = check(client.get(prefix+'/export?format=csv'),200,'CSV export')
    require(len(list(csv.DictReader(io.StringIO(csv_export.text))))==7,'CSV export mismatch')
    uploaded = check(client.post('/api/uploads',files={'file':('synthetic-fortigate.csv',sample,'text/csv')}),202,'upload').json()['analysis_id']
    require(wait_job(uploaded)['state']=='completed','Downloaded synthetic sample could not be uploaded')
    uploaded_summary = check(client.get(f'/api/analyses/{uploaded}/summary'),200,'upload summary').json()
    require(uploaded_summary['counts']==counts and not uploaded_summary['is_demo'],'Uploaded sample totals/provenance mismatch')
    invalid = check(client.post('/api/uploads',files={'file':('invalid.csv',b'unsupported_header\nsynthetic\n','text/csv')}),202,'invalid upload admission').json()['analysis_id']
    failed = wait_job(invalid)
    require(failed['state']=='failed' and failed['error']['code']=='MISSING_BASELINE_FIELDS','Malformed CSV did not fail explicitly')
    check(client.get(f'/api/analyses/{invalid}/summary'),409,'partial-result denial')
    check(client.get('/api'),404,'exact API namespace')
    # Start a new browser session; the earlier job IDs must not grant access.
    client.cookies.clear()
    check(client.get(f'/api/jobs/{ident}'),404,'foreign-session status')
    check(client.get(prefix+'/export?format=json'),404,'foreign-session export')
    return {'status':'passed','records':counts['input_records'],'findings':counts['findings'],
            'foreign_session_rejected':True,'frontend_ready':health['frontend_ready'],
            'scope':'backend synthetic HTTP flow only; frontend/browser/provider checks are separate'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',default='http://127.0.0.1:8000')
    parser.add_argument('--timeout',type=float,default=30)
    args = parser.parse_args()
    try:
        url = httpx.URL(args.base_url)
        if url.scheme not in {'http','https'} or not url.host or url.userinfo or url.query or url.fragment:
            parser.error('Use a plain http(s) base URL without credentials, query or fragment')
        if not 0 < args.timeout <= 120:
            parser.error('--timeout must be positive and at most 120 seconds')
        with httpx.Client(base_url=str(url),timeout=args.timeout) as client:
            report = run_smoke(client,timeout_seconds=args.timeout)
    except (httpx.HTTPError,RuntimeError,KeyError,ValueError) as error:
        print(json.dumps({'status':'failed','error':str(error)},ensure_ascii=False))
        return 1
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
