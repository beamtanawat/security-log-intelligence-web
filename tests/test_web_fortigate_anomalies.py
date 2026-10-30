from pathlib import Path
import pytest
from test_web_uploads import web_client, foreign_client
from web_support import csv_bytes, submit, wait_job

BUNDLE = Path(__file__).resolve().parents[1] / 'data/local-models/fortigate'

@pytest.mark.skipif(not (BUNDLE/'stage_1_8_isolation_forest.joblib').exists(), reason='local model bundle not configured')
def test_anomalies_score_uploaded_records_and_reject_bad_inputs(tmp_path):
    with web_client(tmp_path, fortigate_model_dir=BUNDLE) as (client,app):
        ident=submit(client,csv_bytes([{'net_sentbytes':'200'},{'net_sentbytes':'abc'}]))
        assert wait_job(client,ident).json()['state']=='completed'
        summary=client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['capabilities']['anomalies'] is True
        assert summary['anomaly_inference']['scored_records']==1
        assert summary['anomaly_inference']['unscored_records']==1
        page=client.get(f'/api/analyses/{ident}/anomalies').json()
        assert page['total']==2
        assert 0 <= page['items'][0]['reference_percentile'] <= 100
        assert page['items'][1]['error_code']=='INVALID_ANOMALY_FEATURE'
        with foreign_client(app) as stranger:
            assert stranger.get(f'/api/analyses/{ident}/anomalies').status_code==404

def test_anomalies_model_missing_is_not_faked(tmp_path):
    with web_client(tmp_path) as (client,app):
        ident=submit(client)
        assert wait_job(client,ident).json()['state']=='completed'
        response=client.get(f'/api/analyses/{ident}/anomalies')
        assert response.status_code==503 and response.json()['error']['code']=='MODEL_NOT_CONFIGURED'

@pytest.mark.skipif(not (BUNDLE/'stage_1_8_isolation_forest.joblib').exists(), reason='local model bundle not configured')
def test_anomaly_bundle_integrity_failure_preserves_rules(tmp_path):
    import shutil
    model_dir=tmp_path/'model'
    shutil.copytree(BUNDLE,model_dir)
    (model_dir/'stage_1_7_ai_feature_metadata.json').write_text('{}')
    with web_client(tmp_path, fortigate_model_dir=model_dir) as (client,app):
        ident=submit(client,csv_bytes([{'event_subtype':'anomaly'}]))
        assert wait_job(client,ident).json()['state']=='completed'
        summary=client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['counts']['findings']>0
        assert summary['anomaly_inference']['error_code']=='MODEL_INTEGRITY_FAILED'
        assert client.get(f'/api/analyses/{ident}/anomalies').status_code==503
