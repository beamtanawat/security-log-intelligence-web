"""Smoke runner assertions against the actual ASGI app and generated sample."""
import importlib.util
from pathlib import Path
from test_web_uploads import web_client


def test_smoke_runner_checks_real_demo_and_session_isolation(tmp_path):
    script = Path(__file__).resolve().parents[1]/'scripts'/'smoke_web_backend.py'
    spec = importlib.util.spec_from_file_location('smoke_web_backend',script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with web_client(tmp_path) as (client,app):
        report = module.run_smoke(client,timeout_seconds=5)
        assert report['status'] == 'passed'
        assert report['records'] == 24 and report['findings'] == 7
        assert report['foreign_session_rejected'] is True
        assert report['frontend_ready'] is False
