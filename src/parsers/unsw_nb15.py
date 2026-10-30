"""Streaming prepared UNSW-NB15 CSV reader; no training, inference or split access."""
import csv
from pathlib import Path
from web_api.contracts import WebError

# Predictive columns from upstream stage_2.2a-unsw-contract/1.0, commit 47d931d.
NUMERIC_FEATURES = tuple('dur spkts dpkts sbytes dbytes rate sttl dttl sload dload sloss dloss sinpkt dinpkt sjit djit swin dwin tcprtt synack ackdat smean dmean trans_depth response_body_len'.split())
CATEGORICAL_FEATURES = ('proto','service','state')
REQUIRED_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES
OPTIONAL_COLUMNS = ('id','label','attack_cat')


def iter_unsw_records(path: Path):
    try:
        with path.open(encoding='utf-8-sig',newline='') as handle:
            reader = csv.reader(handle,strict=True)
            header = next(reader,None)
            if header is None:
                raise WebError(422,'EMPTY_CSV','CSV file is empty.')
            if not header or any(not field.strip() for field in header):
                raise WebError(422,'BLANK_HEADER','CSV contains a blank header.')
            if len(set(header)) != len(header):
                raise WebError(422,'DUPLICATE_HEADER','CSV contains duplicate headers.')
            missing = [name for name in REQUIRED_COLUMNS if name not in header]
            if missing:
                raise WebError(422,'MISSING_UNSW_FIELDS','UNSW CSV is missing predictive columns.',missing)
            count = 0
            for count, values in enumerate(reader,1):
                if len(values) != len(header):
                    raise WebError(422,'ROW_WIDTH_MISMATCH','CSV row width does not match its header.',[f'record:{count}'])
                yield count,dict(zip(header,values))
            if not count:
                raise WebError(422,'HEADER_ONLY_CSV','CSV contains no data rows.')
    except UnicodeDecodeError as error:
        raise WebError(422,'INVALID_UTF8','CSV must be valid UTF-8.') from error
    except csv.Error as error:
        raise WebError(422,'CSV_PARSE_ERROR','CSV parsing failed.') from error
    except OSError as error:
        raise WebError(422,'SOURCE_READ_ERROR','The uploaded CSV could not be read.') from error
