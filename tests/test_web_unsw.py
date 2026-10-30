"""Multi-source tests: explicit selection, truthful labels and isolated profiling."""
import csv
import io
from pathlib import Path
from web_support import submit, wait_job, csv_bytes
from test_web_uploads import web_client, foreign_client

# Independent fixture follows the upstream 28-feature predictive contract.
NUMERIC = 'dur spkts dpkts sbytes dbytes rate sttl dttl sload dload sloss dloss sinpkt dinpkt sjit djit swin dwin tcprtt synack ackdat smean dmean trans_depth response_body_len'.split()
HEADERS = ['id']+NUMERIC+['proto','service','state','attack_cat','label']


def unsw_bytes(rows=None, *, labeled=True, bom=False):
    headers = HEADERS if labeled else [h for h in HEADERS if h not in ('label','attack_cat')]
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output,fieldnames=headers)
    writer.writeheader()
    for i,changes in enumerate(rows if rows is not None else [{}],1):
        row = {name:'1' for name in NUMERIC}
        row.update(id=str(i),proto='tcp',service='http',state='FIN')
        if labeled: row.update(label='0',attack_cat='Normal')
        row.update(changes)
        writer.writerow(row)
    return output.getvalue().encode('utf-8-sig' if bom else 'utf-8')


def upload_unsw(client, content):
    response = client.post('/api/uploads',data={'source_type':'unsw_nb15'},files={'file':('flows.csv',content,'text/csv')})
    assert response.status_code==202,response.text
    ident = response.json()['analysis_id']
    assert wait_job(client,ident).json()['state']=='completed'
    return ident


def test_unsw_labels_are_profiled_not_predictions_or_findings(tmp_path):
    rows=[{'label':'1','attack_cat':'Generic','dur':'2'}, {'dur':'4'}, {'label':'','attack_cat':'','dur':'6'}]
    with web_client(tmp_path) as (client,app):
        ident=upload_unsw(client,unsw_bytes(rows,bom=True))
        summary=client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['source_type']=='unsw_nb15' and summary['engine']=='profile'
        assert summary['counts']['analyzed_records']==3 and summary['counts']['findings']==0
        assert summary['counts']['denied_events'] is None
        assert summary['labels']['binary_counts']==[{'label':'NORMAL','count':1},{'label':'ATTACK','count':1}]
        assert summary['labels']['unlabeled_records']==1
        assert summary['inference']['available'] is False
        assert summary['capabilities']['records'] is True and summary['capabilities']['findings'] is False
        assert summary['timeline']==[] and summary['time']['start'] is None
        assert summary['top_sources']==[] and summary['top_ports']==[]
        dur=next(s for s in summary['numeric_stats'] if s['field']=='dur')
        assert dur['min']==2 and dur['max']==6 and dur['mean']==4
        records=client.get(f'/api/analyses/{ident}/records?offset=0&limit=2').json()
        assert records['total']==3 and len(records['items'])==2
        assert records['items'][0]['ground_truth']['label']==1
        assert 'label' not in records['items'][0]['feature_values']
        assert 'attack_cat' not in records['items'][0]['feature_values']
        assert client.get(f'/api/analyses/{ident}/findings').json()['total']==0
        with foreign_client(app) as stranger:
            assert stranger.get(f'/api/analyses/{ident}/records').status_code==404


def test_unsw_without_labels_and_source_schema_are_explicit(tmp_path):
    with web_client(tmp_path) as (client,app):
        schema=client.get('/api/schema').json()
        sources={s['source_type']:s for s in schema['sources']}
        assert set(sources)=={'fortigate','unsw_nb15'}
        assert sources['unsw_nb15']['rules']==[]
        assert 'label' not in sources['unsw_nb15']['required_columns']
        ident=upload_unsw(client,unsw_bytes(labeled=False))
        summary=client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['labels']['available'] is False
        assert summary['labels']['unlabeled_records']==1
        sample=client.get('/api/sample?source_type=unsw_nb15')
        assert sample.status_code==200 and b'attack_cat' in sample.content
        response=client.post('/api/demo?source_type=unsw_nb15')
        assert response.status_code==202
        demo=response.json()['analysis_id']
        assert wait_job(client,demo).json()['state']=='completed'
        assert client.get(f'/api/analyses/{demo}/summary').json()['is_demo'] is True
        for query in ['offset=-1','limit=101','severity=HIGH','limit=1&limit=2']:
            assert client.get(f'/api/analyses/{ident}/records?{query}').status_code==422


def test_unsw_bad_values_remain_quality_issues_not_fabricated_results(tmp_path):
    with web_client(tmp_path) as (client,app):
        ident=upload_unsw(client,unsw_bytes([{'label':'bad','dur':'NaN'}, {'label':'0','attack_cat':'Generic','sbytes':'-1'}]))
        summary=client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['counts']['analyzed_records']==2
        assert summary['quality']['invalid_records']==2
        assert summary['labels']['invalid_label_records']==1
        records=client.get(f'/api/analyses/{ident}/records').json()['items']
        assert records[0]['feature_values']['dur'] is None
        assert records[0]['ground_truth']['label'] is None
        assert records[0]['ground_truth']['label_raw']=='bad'
        assert any(i['issue_code']=='GROUND_TRUTH_CONFLICT' for i in records[1]['normalization_issues'])


def test_selection_is_strict_and_legacy_fortigate_remains_default(tmp_path):
    with web_client(tmp_path) as (client,app):
        for data in [{'source_type':'unknown'},{'source_type':'unsw_nb15','extra':'x'}]:
            response=client.post('/api/uploads',data=data,files={'file':('file.csv',unsw_bytes())})
            assert response.status_code==422
        response=client.post('/api/uploads',data={'source_type':'unsw_nb15'},files={'file':('wrong.csv',csv_bytes())})
        assert response.status_code==202
        failed=wait_job(client,response.json()['analysis_id']).json()
        assert failed['state']=='failed' and failed['error']['code']=='MISSING_UNSW_FIELDS'
        ident=submit(client)
        assert wait_job(client,ident).json()['state']=='completed'
        summary=client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['source_type']=='fortigate' and summary['engine']=='rules'
        assert summary['counts']['denied_events']==0
        assert client.get(f'/api/analyses/{ident}/records').status_code==404


def test_unsw_structure_and_record_limit_do_not_publish_partial_records(tmp_path):
    from web_api.sample import sample_csv
    with web_client(tmp_path,max_records=2) as (client,app):
        for content,code in [(unsw_bytes([{}, {}, {}]),'TOO_MANY_RECORDS'),
                             (b'dur,dur\n1,2\n','DUPLICATE_HEADER'),
                             (unsw_bytes()+b'broken,row\n','ROW_WIDTH_MISMATCH')]:
            response=client.post('/api/uploads',data={'source_type':'unsw_nb15'},files={'file':('bad.csv',content)})
            assert response.status_code==202
            ident=response.json()['analysis_id']
            failed=wait_job(client,ident).json()
            assert failed['state']=='failed' and failed['error']['code']==code
            assert client.get(f'/api/analyses/{ident}/records').status_code==409
            assert not (app.state.jobs.directory(ident)/'records.jsonl').exists()
            assert not list(app.state.jobs.directory(ident).glob('*.part'))


def test_unsw_records_expire_and_never_use_labels_as_feature_values(tmp_path):
    clock=[1_800_000_000.0]
    with web_client(tmp_path,clock=lambda:clock[0]) as (client,app):
        ident=upload_unsw(client,unsw_bytes([{'label':'1','attack_cat':'Generic','dur':'1e308'}, {'label':'0','dur':'1e308'}]))
        records=client.get(f'/api/analyses/{ident}/records').json()['items']
        assert records[0]['feature_values']==records[1]['feature_values']
        assert records[0]['ground_truth'] != records[1]['ground_truth']
        summary=client.get(f'/api/analyses/{ident}/summary').json()
        dur=next(s for s in summary['numeric_stats'] if s['field']=='dur')
        assert dur['mean']==1e308
        clock[0] += 3601
        assert client.get(f'/api/analyses/{ident}/records').status_code==410
        assert not app.state.jobs.directory(ident).exists()


def test_duplicate_source_fields_are_rejected_and_capacity_recovers(tmp_path):
    with web_client(tmp_path) as (client,app):
        fields=[('source_type',(None,'unsw_nb15')),('source_type',(None,'fortigate')),('file',('sample.csv',unsw_bytes()))]
        assert client.post('/api/uploads',files=fields).status_code==422
        ident=upload_unsw(client,unsw_bytes())
        assert wait_job(client,ident).json()['state']=='completed'


def test_missing_unsw_categorical_values_are_unknown_not_silently_clean(tmp_path):
    with web_client(tmp_path) as (client,app):
        ident=upload_unsw(client,unsw_bytes([{'proto':'','service':'  ','state':''}]))
        summary=client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['counts']['records_with_issues']==1
        assert summary['quality']['invalid_records']==0
        assert {'code':'MISSING_CATEGORICAL','count':3} in summary['quality']['issues_by_code']
        record=client.get(f'/api/analyses/{ident}/records').json()['items'][0]
        missing=[i for i in record['normalization_issues'] if i['issue_code']=='MISSING_CATEGORICAL']
        assert {i['source_field'] for i in missing}=={'proto','service','state'}
        assert all(i['status']=='UNKNOWN' for i in missing)
