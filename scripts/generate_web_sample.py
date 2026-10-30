"""Write a generated synthetic CSV; never read or copy historical logs."""
from pathlib import Path
import argparse
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from web_api.sample import sample_csv

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--source-type',choices=['fortigate','unsw_nb15'],default='fortigate')
    args = parser.parse_args()
    with args.output.open('xb') as handle:
        handle.write(sample_csv(args.source_type))
    print(f'Synthetic example written to {args.output}')
