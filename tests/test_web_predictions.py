from pathlib import Path
import pytest
from test_web_uploads import web_client, foreign_client
from test_web_unsw import unsw_bytes, upload_unsw

BUNDLE = Path(__file__).resolve().parents[1] / 'data/local-models/unsw-s2'

@pytest.mark.skipif(not (BUNDLE / 'final.joblib').exists(), reason='local trusted model bundle not configured')
def test_predictions_use_model_and_exclude_uploaded_labels(tmp_path):
    with web_client(tmp_path, unsw_model_dir=BUNDLE) as (client, app):
        ident = upload_unsw(client, unsw_bytes([{'label':'0'}, {'label':'1','attack_cat':'Generic'}, {'dur':'invalid'}]))
        summary = client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['capabilities']['predictions'] is True
        assert summary['inference']['scored_records'] == 2
        assert summary['inference']['unscored_records'] == 1
        page = client.get(f'/api/analyses/{ident}/predictions?limit=3').json()
        assert page['total'] == 3
        assert page['items'][0]['score'] == page['items'][1]['score']
        assert page['items'][2]['error_code'] == 'INVALID_PREDICTIVE_FEATURE'
        with foreign_client(app) as stranger:
            assert stranger.get(f'/api/analyses/{ident}/predictions').status_code == 404

def test_missing_model_returns_clear_error_without_fake_results(tmp_path):
    with web_client(tmp_path) as (client, app):
        ident = upload_unsw(client, unsw_bytes())
        response = client.get(f'/api/analyses/{ident}/predictions')
        assert response.status_code == 503
        assert response.json()['error']['code'] == 'MODEL_NOT_CONFIGURED'

@pytest.mark.skipif(not (BUNDLE / 'final.joblib').exists(), reason='local trusted model bundle not configured')
def test_changed_bundle_is_rejected(tmp_path):
    import shutil
    model_dir = tmp_path / 'model'
    shutil.copytree(BUNDLE,model_dir)
    (model_dir / 'final_metadata.json').write_text('{}')
    with web_client(tmp_path, unsw_model_dir=model_dir) as (client, app):
        ident = upload_unsw(client, unsw_bytes())
        summary = client.get(f'/api/analyses/{ident}/summary').json()
        assert summary['inference']['error_code'] == 'MODEL_INTEGRITY_FAILED'
        assert summary['capabilities']['predictions'] is False
        response = client.get(f'/api/analyses/{ident}/predictions')
        assert response.status_code == 503 and response.json()['error']['code'] == 'MODEL_INTEGRITY_FAILED'

@pytest.mark.skipif(not (BUNDLE / 'final.joblib').exists(), reason='local trusted model bundle not configured')
def test_synthetic_demo_exercises_both_model_classes(tmp_path):
    from web_support import wait_job
    with web_client(tmp_path, unsw_model_dir=BUNDLE) as (client, app):
        ident = client.post('/api/demo?source_type=unsw_nb15').json()['analysis_id']
        assert wait_job(client, ident).json()['state'] == 'completed'
        summary = client.get(f'/api/analyses/{ident}/summary').json()
        counts = {row['class_name']:row['count'] for row in summary['inference']['prediction_counts']}
        assert counts['ATTACK'] > 0 and counts['NORMAL'] > 0
