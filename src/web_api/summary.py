"""Bounded aggregate counters; derived time is explicitly unverified."""
from collections import Counter
from datetime import datetime, timezone

SEVERITIES = ('INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH')


def iso_time(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace('+00:00','Z')


class SummaryBuilder:
    def __init__(self, rules):
        self.count = self.with_issues = self.invalid = self.denied = self.findings = 0
        self.severities = Counter({name:0 for name in SEVERITIES})
        self.rules = Counter({r.metadata.rule_id:0 for r in rules})
        self.sources, self.ports, self.apps = Counter(), Counter(), Counter()
        self.issues, self.times = Counter(), Counter()
        self.references = []

    def add(self, event, findings):
        self.count += 1
        issues = event.normalization_issues
        self.with_issues += bool(issues)
        self.invalid += any(i.status == 'ACTUAL_INVALID' for i in issues)
        self.issues.update(i.issue_code for i in issues)
        self.denied += (event.event.get('action_source') or '').strip().lower() == 'deny'
        source = event.network['source'].get('identifier')
        port = event.network['destination'].get('port')
        app = event.application.get('name_source') or event.application.get('service_source')
        for value, counter in ((source,self.sources),(port,self.ports),(app,self.apps)):
            if value is not None:
                counter[value] += 1
        value = event.time.get('itime_utc_derived')
        if value:
            self.times[value] += 1
        for finding in findings:
            self.findings += 1
            self.rules[finding.rule.rule_id] += 1
            self.severities[finding.rule.severity] += 1
            if len(self.references) < 5:
                self.references.append(finding.finding_id)

    def finish(self):
        # At most 96 bins over any input span. Empty/missing times stay accounted for.
        timeline = []
        width = None
        if self.times:
            epochs = [(int(datetime.fromisoformat(t.replace('Z','+00:00')).timestamp()),n) for t,n in self.times.items()]
            start_epoch = min(t for t,n in epochs)
            end_epoch = max(t for t,n in epochs)
            width = max(3600, ((end_epoch-start_epoch)//96//3600 + 1)*3600)
            bins = Counter()
            for epoch, count in epochs:
                bins[(epoch//width)*width] += count
            timeline = [{'time':iso_time(t),'count':n} for t,n in sorted(bins.items())]
        derived = sum(self.times.values())
        def top(counter, key):
            return [{key:value,'count':count} for value,count in sorted(counter.items(),key=lambda x:(-x[1],str(x[0])))[:10]]
        return {
            'time':{'start': min(self.times) if self.times else None,
                    'end': max(self.times) if self.times else None,
                    'status':'UNVERIFIED_EPOCH_SECONDS' if derived else 'UNAVAILABLE',
                    'unknown_records':self.count-derived,'derived_records':derived,'bin_seconds':width},
            'counts':{'input_records':self.count,'analyzed_records':self.count,
                      'records_with_issues':self.with_issues,'denied_events':self.denied,'findings':self.findings},
            'quality':{'invalid_records':self.invalid,'issues_by_code':[{'code':k,'count':v} for k,v in sorted(self.issues.items())]},
            'severity_counts':[{'name':s,'count':self.severities[s]} for s in SEVERITIES],
            'rule_counts':[{'rule_id':r,'count':n} for r,n in sorted(self.rules.items())],
            'timeline':timeline,'top_sources':top(self.sources,'identifier'),
            'top_ports':top(self.ports,'port'),'top_applications':top(self.apps,'name'),
            'summary':{'mode':'deterministic',
                       'text':f'Analyzed {self.count} records; {self.findings} informational source-observation findings and {self.denied} denied events. A finding or deny is not a confirmed attack. Absence of findings does not establish benign activity. Event timestamps, when shown, assume Unix epoch seconds and remain unverified.',
                       'finding_ids':self.references},
        }
