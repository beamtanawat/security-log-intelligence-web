"""Explicit source registry; no content guessing or label-driven detector fallback."""
from detection.rules import ACTIVE_RULES
from parsers.fortigate import BASELINE_FORTIGATE_FIELDS
from parsers.unsw_nb15 import REQUIRED_COLUMNS,OPTIONAL_COLUMNS
from .contracts import WebError
from .unsw import capabilities


def validate_source(source_type):
    if source_type not in {'fortigate','unsw_nb15'}:
        raise WebError(422,'UNSUPPORTED_SOURCE','Choose fortigate or unsw_nb15.',['source_type'])
    return source_type


def sources_schema():
    return [
        {'source_type':'fortigate','name':'FortiGate CSV','engine':'rules',
         'required_columns':list(BASELINE_FORTIGATE_FIELDS),'optional_columns':[],
         'rules':[{'rule_id':r.metadata.rule_id,'name':r.metadata.name,'severity':r.metadata.severity,'category':r.metadata.category} for r in ACTIVE_RULES],
         'capabilities':capabilities('fortigate')},
        {'source_type':'unsw_nb15','name':'UNSW-NB15 prepared CSV','engine':'profile',
         'required_columns':list(REQUIRED_COLUMNS),'optional_columns':list(OPTIONAL_COLUMNS),'rules':[],
         'capabilities':capabilities('unsw_nb15',labels=True)}]
