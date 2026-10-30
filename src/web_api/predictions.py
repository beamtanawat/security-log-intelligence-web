"""Optional frozen UNSW S2 inference; feature transform follows upstream stage 2.2A."""
from collections import Counter
from importlib import metadata
from pathlib import Path
import hashlib
import json
import math
from .contracts import WebError
from parsers.unsw_nb15 import NUMERIC_FEATURES, CATEGORICAL_FEATURES, REQUIRED_COLUMNS

HASHES = {
    'selection_lock.json':'515df6a7b017853d3917dae276aa656b858587ba294ffdb28a001762ba6ceb5a',
    'final.joblib':'e3e56eaf42331d708d458ab7b824d7df14e61e3c5329a04414e87e9bfcfa5b8d',
    'final_feature_state.json':'1883e03e1b765c9153580e20ef66924a03ca2e70181d0b174c805d5fd26ec8b5',
    'final_metadata.json':'cfe671ee69ebf5b65177657453cc78f6dc63fcdc3ef680a951e308922980ae4f',
}
DISCLAIMER = 'ผลนี้เป็นการคาดการณ์จากโมเดลที่ฝึกด้วย UNSW-NB15 ไม่ใช่การยืนยันการโจมตี คะแนนไม่ได้รับการปรับเทียบเป็นความน่าจะเป็นจริง และไม่ได้ประเมิน Accuracy/F1 ของไฟล์นี้'


def load_bundle(directory):
    if directory is None:
        raise WebError(503,'MODEL_NOT_CONFIGURED','The prediction model is not configured.')
    try:
        payloads = {name:(Path(directory)/name).read_bytes() for name in HASHES}
    except OSError as exc:
        raise WebError(503,'MODEL_LOAD_FAILED','Model files could not be loaded.') from exc
    if any(hashlib.sha256(payloads[name]).hexdigest()!=digest for name,digest in HASHES.items()):
        raise WebError(503,'MODEL_INTEGRITY_FAILED','Model integrity verification failed.')
    try:
        lock = json.loads(payloads['selection_lock.json'])
        state = json.loads(payloads['final_feature_state.json'])
        model_meta = json.loads(payloads['final_metadata.json'])
        canonical = {'dataset_id':state['dataset_id'],'branch_id':state['branch_id'],'feature_order':state['feature_order'],
                     'numeric_medians':{k:state['numeric_medians'][k] for k in NUMERIC_FEATURES},
                     'numeric_means':{k:state['numeric_means'][k] for k in NUMERIC_FEATURES},
                     'numeric_scales':{k:state['numeric_scales'][k] for k in NUMERIC_FEATURES},
                     'categorical_vocabularies':{k:state['categorical_vocabularies'][k] for k in CATEGORICAL_FEATURES},
                     'output_feature_names':state['output_feature_names'],'fit_row_count':state['fit_row_count']}
        digest=hashlib.sha256(json.dumps(canonical,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()).hexdigest()
        if digest != state['state_sha256'] or digest != model_meta['feature_state_sha256'] or digest != lock['models']['S2']['preprocessing_state_sha256'] or state['feature_order'] != list(REQUIRED_COLUMNS):
            raise ValueError('feature state identity mismatch')
        for package,version in [('numpy','2.5.3'),('scikit-learn','1.9.1'),('joblib','1.6.0')]:
            if metadata.version(package) != version: raise ValueError('incompatible model dependency')
        import io
        import joblib
        model=joblib.load(io.BytesIO(payloads['final.joblib']))
        if list(model.classes_) != [0,1] or model.n_features_in_ != len(state['output_feature_names']):
            raise ValueError('model class or feature mismatch')
        return model,state
    except Exception as exc:
        raise WebError(503,'MODEL_LOAD_FAILED','Model or preprocessing could not be loaded.') from exc


def transformed(rows,state):
    # Upstream transform_features: log1p/median/scale, missing indicators and categorical one-hot.
    import numpy as np
    names = {name:i for i,name in enumerate(state['output_feature_names'])}
    matrix = np.zeros((len(rows),len(names)),dtype=np.float64)
    for i,values in enumerate(rows):
        for field in NUMERIC_FEATURES:
            value=values[field]
            if value is None:
                matrix[i,names[f'num::{field}::missing']]=1
                value=state['numeric_medians'][field]
            else:
                value=math.log1p(value)
            matrix[i,names[f'num::{field}::scaled']] = (value-state['numeric_means'][field])/state['numeric_scales'][field]
        for field in CATEGORICAL_FEATURES:
            value=values[field]
            suffix = 'reserved::MISSING' if value is None else (f'value::{value}' if value in state['categorical_vocabularies'][field] else 'reserved::UNKNOWN')
            matrix[i,names[f'cat::{field}::{suffix}']] = 1
    return np.ascontiguousarray(matrix,dtype=np.float64)


def run_predictions(records_path, directory, *, stage=lambda value: None):
    model,state=load_bundle(directory)
    part=records_path.parent/'predictions.part'
    destination=records_path.parent/'predictions.jsonl'
    counts=Counter()
    def flush(batch, output):
        stage('detecting')
        eligible=[r for r in batch if not any(i['issue_code']=='INVALID_NUMERIC' for i in r['normalization_issues'])]
        scores=iter(model.predict_proba(transformed([r['feature_values'] for r in eligible],state))[:,1] if eligible else [])
        for record in batch:
            number=record['source_record_number']
            if any(i['issue_code']=='INVALID_NUMERIC' for i in record['normalization_issues']):
                item={'source_record_number':number,'status':'unscored','class_name':None,'score':None,'score_kind':None,'threshold':None,'error_code':'INVALID_PREDICTIVE_FEATURE'}
                counts['unscored']+=1
            else:
                score=float(next(scores))
                if not math.isfinite(score) or not 0<=score<=1: raise ValueError('invalid prediction score')
                cls='ATTACK' if score>=0.5 else 'NORMAL'
                counts[cls]+=1
                item={'source_record_number':number,'status':'scored','class_name':cls,'score':score,'score_kind':'model_attack_score','threshold':0.5,'error_code':None}
            output.write(json.dumps(item,allow_nan=False)+'\n')
    try:
        with records_path.open(encoding='utf-8') as source, part.open('x',encoding='utf-8') as output:
            batch=[]
            for line in source:
                batch.append(json.loads(line))
                if len(batch)==512:
                    flush(batch,output); batch=[]
            if batch: flush(batch,output)
        part.replace(destination)
    finally:
        part.unlink(missing_ok=True)
    return destination,{'available':True,'model':{'model_id':'BASE-S2','family':'RANDOM_FOREST','artifact_sha256':HASHES['final.joblib'],'training_dataset':'UNSW-NB15','trained_at':None},'threshold':0.5,'scored_records':counts['NORMAL']+counts['ATTACK'],'unscored_records':counts['unscored'],'prediction_counts':[{'class_name':c,'count':counts[c]} for c in ('NORMAL','ATTACK')],'evaluation':{'status':'not_evaluated'},'disclaimer':DISCLAIMER}
