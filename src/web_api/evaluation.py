"""Publish immutable historical benchmark aggregates, never uploaded-file accuracy."""
from pathlib import Path
import hashlib
import json
from .contracts import WebError

DATA_DIR = Path(__file__).resolve().parent/'assets'/'evaluation'
SNAPSHOT_SHA256 = '061f7af5ef43f49f4f7595d0753a5c2d4acdb5a44f044e0c9bbdf5ffb0ca7307'


def historical_evaluation():
    try:
        raw=(DATA_DIR/'evaluation.json').read_bytes()
        if hashlib.sha256(raw).hexdigest()!=SNAPSHOT_SHA256:
            raise ValueError('Evaluation snapshot identity mismatch')
        data=json.loads(raw)
        for table in data['source_tables']:
            if hashlib.sha256((DATA_DIR/table['filename']).read_bytes()).hexdigest()!=table['sha256']:
                raise ValueError('Evaluation source table identity mismatch')
        # Keep the verified historical snapshot immutable; only clarify stale
        # presentation text in the API response after verification.
        stale = ('No deployed classifier or row-level predictions are available in this web app; '
                 'original computation time is not recorded in these source tables.')
        current = ('Historical row-level predictions and original computation time are not available '
                   'in these source tables. See the per-analysis summary for current model availability.')
        data['limitations'] = [current if item == stale else item for item in data['limitations']]
        return data
    except (OSError,ValueError,KeyError) as error:
        raise WebError(503,'EVALUATION_UNAVAILABLE','Historical evaluation artifacts are unavailable or failed verification.') from error
