"""Small fully synthetic sample, generated from the supported schema."""
import csv
import io
from parsers.fortigate import BASELINE_FORTIGATE_FIELDS


def fortigate_sample_csv() -> bytes:
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=BASELINE_FORTIGATE_FIELDS)
    writer.writeheader()
    for i in range(24):
        row = dict.fromkeys(BASELINE_FORTIGATE_FIELDS, '')
        row.update(loguid=f'SYNTHETIC_LOG_{i+1:03}', itime=str(1793318400 + i*1800),
                   src_ip=f'SRCIP_SYNTHETIC_{i%4+1}', dst_ip=f'DSTIP_SYNTHETIC_{i%3+1}',
                   net_proto='6', src_port=str(50000+i), dst_port=str([443,80,53][i%3]),
                   app_service=['HTTPS','HTTP','DNS'][i%3], event_type='traffic',
                   event_action='deny' if i%4==0 else 'accept',
                   event_subtype='anomaly' if i%6==0 else 'forward',
                   threat_name='SYNTHETIC_SOURCE_OBSERVATION' if i%8==0 else '',
                   net_sentbytes=str((i+1)*1024), net_recvbytes=str((i+1)*2048),
                   net_sentpkts=str(i+1), net_rcvdpkts=str(i+2), net_sessionduration=str(i+1))
        writer.writerow(row)
    return stream.getvalue().encode('utf-8')


def sample_csv(source_type='fortigate') -> bytes:
    from .sources import validate_source
    from parsers.unsw_nb15 import REQUIRED_COLUMNS
    validate_source(source_type)
    if source_type == 'fortigate':
        return fortigate_sample_csv()
    stream = io.StringIO(newline='')
    columns = ('id',)+REQUIRED_COLUMNS+('attack_cat','label')
    writer = csv.DictWriter(stream,fieldnames=columns)
    writer.writeheader()
    # Fully synthetic feature vectors selected to exercise both model outcomes.
    # These demo labels are invented annotations, not verified ground truth.
    attack_features = {'dur':30,'spkts':1,'dpkts':4,'sbytes':500,'dbytes':400,'rate':0.167,
        'sttl':62,'dttl':64,'sload':133.33,'dload':106.67,'sloss':0,'dloss':0,
        'sinpkt':0,'dinpkt':20,'sjit':0,'djit':1,'swin':0,'dwin':255,'tcprtt':0.01,
        'synack':0.005,'ackdat':0.1,'smean':500,'dmean':100,'trans_depth':0,
        'response_body_len':0,'proto':'udp','service':'http','state':'CON'}
    normal_features = {'dur':5,'spkts':1,'dpkts':0,'sbytes':500,'dbytes':0,'rate':0.2,
        'sttl':31,'dttl':31,'sload':800,'dload':0,'sloss':0,'dloss':0,'sinpkt':5,
        'dinpkt':1,'sjit':1,'djit':1,'swin':255,'dwin':255,'tcprtt':0.01,'synack':0.1,
        'ackdat':0.1,'smean':500,'dmean':0,'trans_depth':0,'response_body_len':0,
        'proto':'tcp','service':'http','state':'FIN'}
    for index in range(12):
        attack = index % 3 == 0
        row = dict(attack_features if attack else normal_features)
        row.update(id=str(index+1),label='1' if attack else '0',
                   attack_cat='Synthetic attack' if attack else 'Normal')
        writer.writerow(row)
    return stream.getvalue().encode('utf-8')
