"""Verify workspace access tokens with the configured Supabase Auth service.

The provider's authenticated user endpoint validates the token. We never trust
unverified JWT claims, log tokens, follow redirects, or expose provider errors.
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from uuid import UUID
from .contracts import WebError

MAX_RESPONSE_BYTES = 65536
_TOKEN_RE = re.compile(r'^[A-Za-z0-9._~-]{1,8192}$')
_PROJECT_HOST_RE = re.compile(r'^[a-z0-9-]+\.supabase\.co$')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def verified_user_id(authorization, project_url, publishable_key):
    if not project_url or not publishable_key:
        raise WebError(503,'AUTH_NOT_CONFIGURED','Workspace authentication is not configured.')
    try:
        parsed=urllib.parse.urlsplit(project_url)
        valid=(parsed.scheme=='https' and parsed.hostname is not None and
               _PROJECT_HOST_RE.fullmatch(parsed.hostname) and parsed.port is None and
               parsed.username is None and parsed.password is None and
               parsed.path in ('','/') and not parsed.query and not parsed.fragment)
    except ValueError:
        valid=False
    if not valid:
        raise WebError(503,'AUTH_CONFIGURATION_INVALID','Workspace authentication configuration is invalid.')
    scheme,sep,token=(authorization or '').partition(' ')
    if scheme.lower()!='bearer' or not sep or not _TOKEN_RE.fullmatch(token):
        raise WebError(401,'AUTH_REQUIRED','Sign in to use the workspace.')
    try:
        request=urllib.request.Request(project_url.rstrip('/')+'/auth/v1/user',
            headers={'Authorization':'Bearer '+token,'apikey':publishable_key,'Accept':'application/json'},method='GET')
        opener=urllib.request.build_opener(_NoRedirect())
        with opener.open(request,timeout=5) as response:
            payload=response.read(MAX_RESPONSE_BYTES+1)
        if len(payload)>MAX_RESPONSE_BYTES:
            raise ValueError('identity response too large')
        user=json.loads(payload)
        if not isinstance(user,dict) or not isinstance(user.get('id'),str):
            raise ValueError('identity response missing user id')
        return str(UUID(user['id']))
    except urllib.error.HTTPError as error:
        if error.code in (401,403):
            raise WebError(401,'AUTH_INVALID','Your session is invalid or expired. Sign in again.') from error
        raise WebError(503,'AUTH_PROVIDER_UNAVAILABLE','Workspace authentication is temporarily unavailable.') from error
    except (OSError,ValueError,TypeError) as error:
        raise WebError(503,'AUTH_PROVIDER_UNAVAILABLE','Workspace authentication is temporarily unavailable.') from error
