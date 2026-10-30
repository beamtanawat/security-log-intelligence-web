"""Export tests catch filter drift and spreadsheet expression injection."""
import csv
import io
from web_support import csv_bytes, submit, wait_job
from test_web_uploads import web_client


def test_exports_match_filters_and_escape_cells_without_altering_json(tmp_path):
    dangerous = '\t=HYPERLINK("https://example.invalid")'
    with web_client(tmp_path) as (client, app):
        ident = submit(client, csv_bytes([{'event_subtype':'anomaly','threat_name':'SYNTHETIC','src_ip':dangerous}]))
        wait_job(client, ident)
        url = f'/api/analyses/{ident}/export'
        response = client.get(url, params={'format':'json','rule_id':'fortigate.source_threat_observation'})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1 and data[0]['source_identifier'] == dangerous
        assert 'attachment' in response.headers['content-disposition']
        response = client.get(url, params={'format':'csv'})
        rows = list(csv.DictReader(io.StringIO(response.text)))
        assert len(rows) == 2
        assert all(row['source_identifier'].startswith("'") for row in rows)
        assert client.get(url, params={'format':'json','severity':'HIGH'}).json() == []
        for query in ['format=exe','format=csv&limit=1','format=json&severity=nope','']:
            assert client.get(url+'?'+query).status_code == 422
