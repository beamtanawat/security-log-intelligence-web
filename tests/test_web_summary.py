"""Hand-counted data catches double-counting and overclaiming security/time semantics."""
from web_support import csv_bytes, submit, wait_job
from test_web_uploads import web_client


def test_counts_evidence_and_uncertain_time_are_reconciled(tmp_path):
    rows = [
        {'event_subtype': 'anomaly', 'threat_name': 'SYNTHETIC_OBSERVATION', 'event_action': 'deny'},
        {'event_action': 'deny', 'itime': 'not-time', 'dst_port': 'invalid'},
        {'itime': '', 'src_ip': '', 'app_service': ''},
    ]
    with web_client(tmp_path) as (client, app):
        ident = submit(client, csv_bytes(rows))
        assert wait_job(client, ident).json()['state'] == 'completed'
        summary = client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['counts']['input_records'] == 3
        assert summary['counts']['analyzed_records'] == 3
        assert summary['counts']['findings'] == 2
        assert summary['counts']['denied_events'] == 2
        assert summary['quality']['invalid_records'] == 1
        assert summary['time']['unknown_records'] == 2
        assert summary['time']['derived_records'] == 1
        assert summary['time']['status'] == 'UNVERIFIED_EPOCH_SECONDS'
        assert sum(x['count'] for x in summary['timeline']) == 1
        assert summary['top_sources'] == [{'identifier': 'SRCIP_SYNTHETIC', 'count': 2}]
        assert summary['severity_counts'] == [
            {'name':'INFORMATIONAL','count':2}, {'name':'LOW','count':0},
            {'name':'MEDIUM','count':0}, {'name':'HIGH','count':0}]
        findings = client.get(f'/api/analyses/{ident}/findings').json()
        assert findings['total'] == 2
        assert [f['source_record_number'] for f in findings['items']] == [1, 1]
        first = findings['items'][0]
        assert first['source_identifier'] == 'SRCIP_SYNTHETIC'
        assert first['time_status'] == 'UNVERIFIED_EPOCH_SECONDS'
        assert first['uncertainties'] and first['false_positive_note']
        assert {'field':'event.subtype_source','value':'anomaly','source_fields':['event_subtype'],'mapping_operation':'COPIED','interpretation_status':'VERIFIED'} in first['evidence']
        detail = client.get(f"/api/analyses/{ident}/findings/{first['finding_id']}")
        assert detail.json() == first
        assert set(summary['summary']['finding_ids']) <= {f['finding_id'] for f in findings['items']}
        assert summary['summary']['mode'] == 'deterministic'


def test_no_matches_or_usable_times_is_success_with_empty_charts(tmp_path):
    with web_client(tmp_path) as (client, app):
        ident = submit(client, csv_bytes([{'itime':''}]))
        wait_job(client, ident)
        summary = client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['counts']['findings'] == 0
        assert summary['timeline'] == []
        assert summary['time']['start'] is None
        assert summary['time']['status'] == 'UNAVAILABLE'
        assert summary['summary']['finding_ids'] == []
        assert client.get(f'/api/analyses/{ident}/findings').json()['items'] == []


def test_filters_pagination_and_validation(tmp_path):
    with web_client(tmp_path) as (client, app):
        ident = submit(client, csv_bytes([{'event_subtype':'anomaly','threat_name':'SYNTHETIC'}, {'event_subtype':'anomaly'}]))
        wait_job(client, ident)
        url = f'/api/analyses/{ident}/findings'
        page = client.get(url, params={'offset':1,'limit':1}).json()
        assert page['total'] == 3 and len(page['items']) == 1
        assert page['offset'] == 1 and page['limit'] == 1
        assert client.get(url, params={'severity':'HIGH'}).json()['total'] == 0
        assert client.get(url, params={'rule_id':'fortigate.source_threat_observation'}).json()['total'] == 1
        for query in ['limit=101','offset=-1','severity=CRITICAL','rule_id=unknown','surprise=x','limit=1&limit=2']:
            assert client.get(url+'?'+query).status_code == 422


def test_finding_record_filter_joins_anomalies_within_owner_session(tmp_path):
    from test_web_uploads import foreign_client
    with web_client(tmp_path) as (client, app):
        ident = submit(client, csv_bytes([{'event_subtype':'anomaly','threat_name':'SYNTHETIC'}, {'event_subtype':'anomaly'}]))
        assert wait_job(client,ident).json()['state']=='completed'
        url = f'/api/analyses/{ident}/findings'
        first=client.get(url,params={'source_record_number':1}).json()
        assert first['total']==2 and all(x['source_record_number']==1 for x in first['items'])
        second=client.get(url,params={'source_record_number':2}).json()
        assert second['total']==1 and second['items'][0]['source_record_number']==2
        assert client.get(url,params={'source_record_number':3}).json()['total']==0
        for value in ('0','-1','abc','1.0',''):
            assert client.get(url,params={'source_record_number':value}).status_code==422
        assert client.get(url+'?source_record_number=1&source_record_number=2').status_code==422
        with foreign_client(app) as stranger:
            assert stranger.get(url,params={'source_record_number':1}).status_code==404
