"""Two focused checks for historical metrics, not uploaded-file evaluation."""
from test_web_uploads import web_client


def test_historical_benchmark_values_and_provenance_are_explicit(tmp_path):
    with web_client(tmp_path) as (client,app):
        response=client.get('/api/evaluation')
        assert response.status_code==200
        data=response.json()
        assert data['scope']=='historical_benchmark'
        assert data['applies_to_current_upload'] is False
        assert data['inference_available'] is False
        assert data['dataset']=='UNSW-NB15'
        assert data['split']=='OFFICIAL_TEST_ALL_ROWS'
        models={m['model']:m for m in data['models']}
        assert set(models)=={'BASE-S1','BASE-S2','CHAIN-S1','CHAIN-S2'}
        selected=models['BASE-S2']
        assert selected['metrics']['accuracy']==0.8335641063013166
        assert selected['metrics']['f1']==0.8675104179759637
        assert selected['row_count']==82332 and selected['threshold']==.5
        assert selected['source_report'] and len(selected['source_report_sha256'])==64
        for model in models.values():
            cm=model['confusion_matrix']
            assert sum(cm.values())==model['row_count']
            assert abs((cm['tp']+cm['tn'])/model['row_count']-model['metrics']['accuracy'])<1e-12
        assert data['test_newly_unseen'] is False
        assert data['computed_at'] is None  # unknown source computation time must not be invented
        assert not any('No deployed classifier' in item for item in data['limitations'])
        assert any('per-analysis' in item for item in data['limitations'])


def test_missing_evaluation_artifact_fails_closed(tmp_path,monkeypatch):
    import web_api.evaluation as evaluation
    monkeypatch.setattr(evaluation,'DATA_DIR',tmp_path/'missing-report')
    with web_client(tmp_path) as (client,app):
        response=client.get('/api/evaluation')
        assert response.status_code==503
        assert response.json()['error']['code']=='EVALUATION_UNAVAILABLE'
