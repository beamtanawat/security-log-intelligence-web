"""Runtime settings and internal disk-backed analysis contracts."""
from dataclasses import dataclass, field
from pathlib import Path
from collections.abc import Callable
import os
import time
import tempfile


class WebError(Exception):
    def __init__(self, status: int, code: str, message: str, fields=()):
        self.status = status
        self.code = code
        self.message = message
        self.fields = list(fields)
        super().__init__(message)

    def payload(self):
        return {'code': self.code, 'message': self.message, 'fields': self.fields}


@dataclass(frozen=True)
class WebSettings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv('SLI_DATA_DIR', str(Path(tempfile.gettempdir())/'security-log-web'))))
    frontend_dir: Path = field(default_factory=lambda: Path(__file__).resolve().parents[2] / 'web' / 'dist')
    allowed_hosts: tuple[str, ...] = ('localhost', '127.0.0.1')
    secure_cookies: bool = False
    max_file_bytes: int = 10 * 1024 * 1024
    max_records: int = 50_000
    retention_seconds: int = 3600
    max_retained_jobs: int = 8
    upload_timeout_seconds: float = 30
    clock: Callable[[], float] = time.time

    def __post_init__(self):
        if not self.allowed_hosts or '*' in self.allowed_hosts:
            raise ValueError('Configure explicit allowed hosts, not a wildcard.')
        for name in ('max_file_bytes','max_records','retention_seconds','max_retained_jobs'):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise ValueError(f'{name} must be a positive integer')
        if self.retention_seconds > 3600:
            raise ValueError('Retention cannot exceed 3600 seconds')
        if not 0 < self.upload_timeout_seconds <= 60:
            raise ValueError('Upload timeout must be positive and at most 60 seconds')

    @classmethod
    def from_env(cls):
        external_host = os.getenv('RENDER_EXTERNAL_HOSTNAME','').strip()
        defaults = 'localhost,127.0.0.1' + (','+external_host if external_host else '')
        hosts = tuple(h.strip() for h in os.getenv('SLI_ALLOWED_HOSTS',defaults).split(',') if h.strip())
        secure_default = 'true' if external_host else 'false'
        return cls(allowed_hosts=hosts, secure_cookies=os.getenv('SLI_SECURE_COOKIES',secure_default).lower() == 'true')


@dataclass(frozen=True)
class AnalysisResult:
    summary: dict
    findings_path: Path
    records_path: Path | None = None
