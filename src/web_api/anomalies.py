"""Frozen Stage 1.8 FortiGate Isolation Forest inference, no fitting."""
from bisect import bisect_right
from collections import Counter
from importlib import metadata
from itertools import accumulate
from pathlib import Path
import hashlib
import io
import json
import math
from ai_features.models import FEATURE_NAMES
from ai_features.transform import RarityMaps, FeatureTransformError, extract_feature_observation, build_feature_values
from parsers.fortigate import iter_fortigate_records
from normalization.fortigate import normalize_fortigate_record
from .contracts import WebError

HASHES={
 'stage_1_8_isolation_forest.joblib':'5e072b4e89b864eba854f70239fd3c2647a1d78468adb733ebc0a8f54e07bc53',
 'stage_1_8_model_metadata.json':'476897d7e6906385d59b2df05b489d1db6ea8944911da458067c28ea0451412b',
 'stage_1_8_manifest.json':'9c00081f8e18a092ed8a545b680495820c3514ccef57d78bdf0906804992be77',
 'stage_1_7_ai_feature_metadata.json':'b74373532d5a15de84113d57249e642311a1b3b6c6e827b8747bba94082e2ae0',
}
DISCLAIMER='คะแนนแสดงความผิดปกติเทียบกับข้อมูลอ้างอิงเดิม ไม่ใช่ความน่าจะเป็นหรือการยืนยันการโจมตี ต้องตรวจสอบบริบทเพิ่มเติม'


def load_bundle(directory):
    if directory is None: raise WebError(503,'MODEL_NOT_CONFIGURED','The anomaly model is not configured.')
    try: payloads={n:(Path(directory)/n).read_bytes() for n in HASHES}
    except OSError as error: raise WebError(503,'MODEL_LOAD_FAILED','Anomaly model files could not be loaded.') from error
    if any(hashlib.sha256(payloads[n]).hexdigest()!=h for n,h in HASHES.items()):
        raise WebError(503,'MODEL_INTEGRITY_FAILED','Anomaly model integrity verification failed.')
    try:
        manifest=json.loads(payloads['stage_1_8_manifest.json'])
        model_meta=json.loads(payloads['stage_1_8_model_metadata.json'])
        features=json.loads(payloads['stage_1_7_ai_feature_metadata.json'])
        if manifest['feature_names']!=list(FEATURE_NAMES) or features['feature_names']!=list(FEATURE_NAMES) or model_meta['feature_metadata_identity']['sha256']!=HASHES['stage_1_7_ai_feature_metadata.json']:
            raise ValueError('feature identity mismatch')
        for package,version in [('numpy','2.5.3'),('scikit-learn','1.9.1'),('joblib','1.6.0')]:
            if metadata.version(package)!=version: raise ValueError('incompatible dependency')
        import joblib
        model=joblib.load(io.BytesIO(payloads['stage_1_8_isolation_forest.joblib']))
        if model.n_features_in_!=len(FEATURE_NAMES): raise ValueError('incompatible model dimensions')
        maps=features['rarity_maps']
        def counts(k): return {(p,v):n for p,v,n in maps[k]['counts']}
        def denoms(k): return dict(maps[k]['protocol_denominators'])
        rarity=RarityMaps(source_port_counts=counts('source_port'),destination_port_counts=counts('destination_port'),service_counts=counts('service'),source_port_denominators=denoms('source_port'),destination_port_denominators=denoms('destination_port'),service_denominators=denoms('service'))
        distribution=model_meta['reference_raw_score_distribution']
        values=[float(v) for v,n in distribution]; cumulative=list(accumulate(n for v,n in distribution))
        if not values or values!=sorted(values) or cumulative[-1]!=model_meta['reference_count']: raise ValueError('bad reference distribution')
        return model,rarity,values,cumulative
    except Exception as error:
        raise WebError(503,'MODEL_LOAD_FAILED','Anomaly model or feature state could not be loaded.') from error


def run_anomalies(source, directory, *, stage=lambda value: None):
    model,rarity,values,cumulative=load_bundle(directory)
    import numpy as np
    part=source.parent/'anomalies.part'; output_path=source.parent/'anomalies.jsonl'
    counts=Counter()
    def flush(batch,output):
        stage('detecting')
        eligible=[features for number,features in batch if features is not None]
        scores=iter(-model.score_samples(np.asarray(eligible,dtype=np.float32)) if eligible else [])
        for number,features in batch:
            if features is None:
                item={'source_record_number':number,'status':'unscored','raw_abnormality':None,'reference_percentile':None,'error_code':'INVALID_ANOMALY_FEATURE'}
                counts['unscored']+=1
            else:
                score=float(next(scores))
                if not math.isfinite(score): raise ValueError('invalid anomaly score')
                index=bisect_right(values,score)
                percentile=100.0*(cumulative[index-1] if index else 0)/cumulative[-1]
                item={'source_record_number':number,'status':'scored','raw_abnormality':score,'reference_percentile':round(percentile,6),'error_code':None}
                counts['scored']+=1
            output.write(json.dumps(item,allow_nan=False)+'\n')
    try:
        with part.open('x',encoding='utf-8') as out:
            batch=[]
            for record in iter_fortigate_records(source):
                try:
                    observation=extract_feature_observation(normalize_fortigate_record(record))
                    features,_=build_feature_values(observation,rarity)
                except FeatureTransformError:
                    features=None
                batch.append((record.record_number,features))
                if len(batch)==512: flush(batch,out); batch=[]
            if batch: flush(batch,out)
        part.replace(output_path)
    finally:
        part.unlink(missing_ok=True)
    return output_path,{'available':True,'model':{'model_id':'FORTIGATE-STAGE-1.8','family':'ISOLATION_FOREST','artifact_sha256':HASHES['stage_1_8_isolation_forest.joblib'],'training_dataset':'FortiGate reference partition','trained_at':None},'scored_records':counts['scored'],'unscored_records':counts['unscored'],'score_semantics':'negative_score_samples_higher_is_more_abnormal','reference_percentile_semantics':'percent_of_frozen_reference_scores_at_or_below_score','disclaimer':DISCLAIMER}
