"""Data-quality details must be session-owned and retain source row context."""
from test_web_uploads import web_client, foreign_client
from test_web_unsw import unsw_bytes, upload_unsw
from web_support import csv_bytes, submit, wait_job


def test_fortigate_quality_details_are_paginated_and_session_owned(tmp_path):
    with web_client(tmp_path) as (client,app):
        ident=submit(client,csv_bytes([{'src_port':'invalid'},{'dst_port':'invalid'}]))
        assert wait_job(client,ident).json()['state']=='completed'
        assert client.get(f'/api/analyses/{ident}/summary').json()['capabilities']['quality_details'] is True
        url=f'/api/analyses/{ident}/issues'
        page=client.get(url,params={'offset':0,'limit':1})
        assert page.status_code==200 and page.json()['total']==2
        assert page.json()['items'][0]['source_record_number']==1
        assert any(i['source_field']=='src_port' and i['status']=='ACTUAL_INVALID' for i in page.json()['items'][0]['issues'])
        assert client.get(url,params={'offset':1,'limit':1}).json()['items'][0]['source_record_number']==2
        assert client.get(url,params={'limit':101}).status_code==422
        with foreign_client(app) as stranger:
            assert stranger.get(url).status_code==404
        assert client.delete(f'/api/analyses/{ident}').status_code==204
        assert client.get(url).status_code==410


def test_unsw_quality_does_not_disclose_raw_input(tmp_path):
    with web_client(tmp_path) as (client,app):
        ident=upload_unsw(client,unsw_bytes([{'dur':'not-a-number','label':'bad'},{}]))
        response=client.get(f'/api/analyses/{ident}/issues')
        assert response.status_code==200
        data=response.json()
        assert data['total']==1 and data['items'][0]['source_record_number']==1
        assert {'INVALID_NUMERIC','INVALID_LABEL'} <= {i['issue_code'] for i in data['items'][0]['issues']}
        assert 'not-a-number' not in response.text
