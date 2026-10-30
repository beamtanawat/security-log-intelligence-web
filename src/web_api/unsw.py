"""UNSW flow profiling with separately reported uploaded ground truth, never predictions."""
from collections import Counter
import json
import math
from pathlib import Path
from parsers.unsw_nb15 import NUMERIC_FEATURES,CATEGORICAL_FEATURES,iter_unsw_records
from .contracts import AnalysisResult,WebError
from .summary import SEVERITIES


def capabilities(source_type, *, labels=False):
    fortigate = source_type == 'fortigate'
    return {'findings':fortigate,'records':not fortigate,'labels':labels,
            'timeline':fortigate,'network_identifiers':fortigate,'ports':fortigate,
            'denied_events':fortigate,'model_inference':False,'evaluation':False}


def _issue(field,code,description,status='ACTUAL_INVALID'):
    return {'source_field':field,'issue_code':code,'status':status,'description':description}


def profile_record(number,raw):
    features,issues = {},[]
    for field in NUMERIC_FEATURES:
        text = raw[field].strip()
        value = None
        if text:
            try:
                value = float(text)
                if not math.isfinite(value) or value < 0:
                    raise ValueError
            except ValueError:
                value = None
                issues.append(_issue(field,'INVALID_NUMERIC','Expected a finite nonnegative numeric value.'))
        else:
            issues.append(_issue(field,'MISSING_NUMERIC','Numeric value is missing.','UNKNOWN'))
        features[field] = value
    for field in CATEGORICAL_FEATURES:
        features[field] = raw[field].strip() or None
        if features[field] is None:
            issues.append(_issue(field,'MISSING_CATEGORICAL','Categorical predictor is missing.','UNKNOWN'))
    ground_truth = None
    if 'label' in raw or 'attack_cat' in raw:
        label_raw = raw.get('label','')
        category = raw.get('attack_cat','').strip() or None
        label_text = label_raw.strip().upper()
        label = {'0':0,'NORMAL':0,'1':1,'ATTACK':1}.get(label_text)
        if label_text and label is None:
            issues.append(_issue('label','INVALID_LABEL','Uploaded label must be 0/1 or NORMAL/ATTACK.'))
        if label is not None and category and ((label==0 and category.lower()!='normal') or (label==1 and category.lower()=='normal')):
            issues.append(_issue('attack_cat','GROUND_TRUTH_CONFLICT','Uploaded label and attack category are inconsistent; neither is a prediction.'))
        ground_truth = {'label':label,'label_raw':label_raw,'attack_cat':category}
    return {'source_record_number':number,'source_type':'unsw_nb15','source_id':raw.get('id') or None,
            'feature_values':features,'ground_truth':ground_truth,'normalization_issues':issues}


def analyze_unsw(path: Path, *, max_records,stage) -> AnalysisResult:
    records_part = path.parent/'records.part'
    findings_part = path.parent/'findings.part'
    issues_part = path.parent/'issues.part'
    count = with_issues = invalid_records = invalid_labels = labeled = 0
    binary,category_counts,issue_counts = Counter(),Counter(),Counter()
    categories = {field:Counter() for field in CATEGORICAL_FEATURES}
    stats = {field:{'field':field,'count':0,'missing':0,'invalid':0,'min':None,'max':None,'mean':None} for field in NUMERIC_FEATURES}
    try:
        stage('validating')
        with records_part.open('x',encoding='utf-8') as records, issues_part.open('x',encoding='utf-8') as issues_handle:
            for number,raw in iter_unsw_records(path):
                if number > max_records:
                    raise WebError(413,'TOO_MANY_RECORDS',f'CSV exceeds the {max_records:,} record limit.')
                stage('normalizing')
                record = profile_record(number,raw)
                records.write(json.dumps(record,ensure_ascii=False,allow_nan=False)+'\n')
                count += 1
                issues = record['normalization_issues']
                with_issues += bool(issues)
                invalid_records += any(i['status']=='ACTUAL_INVALID' for i in issues)
                invalid_labels += any(i['issue_code']=='INVALID_LABEL' for i in issues)
                issue_counts.update(i['issue_code'] for i in issues)
                if issues:
                    issues_handle.write(json.dumps({'source_record_number':number,'issues':issues},ensure_ascii=False)+'\n')
                truth = record['ground_truth']
                if truth:
                    if truth['label'] is not None:
                        labeled += 1
                        binary[truth['label']] += 1
                    if truth['attack_cat']:
                        category_counts[truth['attack_cat']] += 1
                for field,value in record['feature_values'].items():
                    if field in categories:
                        if value is not None: categories[field][value] += 1
                        continue
                    stat = stats[field]
                    if value is None:
                        if raw[field].strip(): stat['invalid'] += 1
                        else: stat['missing'] += 1
                    else:
                        stat['count'] += 1
                        stat['min'] = value if stat['min'] is None else min(stat['min'],value)
                        stat['max'] = value if stat['max'] is None else max(stat['max'],value)
                        stat['mean'] = value if stat['mean'] is None else stat['mean']+(value-stat['mean'])/stat['count']
        stage('summarizing')
        def top(counter,key):
            return [{key:k,'count':v} for k,v in sorted(counter.items(),key=lambda kv:(-kv[1],str(kv[0])))[:20]]
        labels = {'source':'uploaded_columns_not_predictions','available':bool(labeled or category_counts),
                  'labeled_records':labeled,'unlabeled_records':count-labeled,'invalid_label_records':invalid_labels,
                  'binary_counts':[{'label':'NORMAL','count':binary[0]},{'label':'ATTACK','count':binary[1]}],
                  'attack_category_counts':top(category_counts,'category')}
        summary = {'source_type':'unsw_nb15','capabilities':capabilities('unsw_nb15',labels=labels['available']),
                   'inference':{'available':False,'reason':'No trusted inference bundle is configured; uploaded labels are user-provided annotations, not predictions or independently verified ground truth.'},
                   'labels':labels,'time':{'start':None,'end':None,'status':'UNAVAILABLE','unknown_records':count,'derived_records':0,'bin_seconds':None},
                   'counts':{'input_records':count,'analyzed_records':count,'records_with_issues':with_issues,'denied_events':None,'findings':0},
                   'quality':{'invalid_records':invalid_records,'issues_by_code':top(issue_counts,'code')},
                   'severity_counts':[{'name':s,'count':0} for s in SEVERITIES],'rule_counts':[],
                   'timeline':[],'top_sources':[],'top_ports':[],'top_applications':top(categories['service'],'name'),
                   'protocol_counts':top(categories['proto'],'protocol'),'state_counts':top(categories['state'],'state'),
                   'numeric_stats':list(stats.values()),
                   'summary':{'mode':'deterministic','text':f'Profiled {count} UNSW-NB15 flow records. {labeled} records have a valid uploaded binary label; {count-labeled} do not. Labels and attack categories come from uploaded columns, not model predictions. No attack detection, model accuracy or F1 is computed. No timestamp or network identifier is inferred from row IDs.','finding_ids':[]}}
        findings_part.write_text('',encoding='utf-8')
        records_path = path.parent/'records.jsonl'
        findings_path = path.parent/'findings.jsonl'
        records_part.replace(records_path)
        findings_part.replace(findings_path)
        issues_part.replace(path.parent/'issues.jsonl')
        return AnalysisResult(summary,findings_path,records_path)
    finally:
        for part in (records_part,findings_part,issues_part): part.unlink(missing_ok=True)
