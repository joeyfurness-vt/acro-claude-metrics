#!/usr/bin/env python3
"""check-endpoint.py — same checks as check-endpoint.mjs, for Python projects."""
import os
import re
import sys
from urllib.request import urlopen
from urllib.error import URLError, HTTPError

METRICS_PORT = os.environ.get('METRICS_PORT', '9100')
APP_METRICS_URL = f'http://localhost:{METRICS_PORT}/metrics'
AGENT_METRICS_URL = 'http://localhost:9090/metrics'


def check(name, fn):
    try:
        fn()
        print(f'  ✓ {name}')
        return True
    except Exception as e:
        print(f'  ✗ {name}\n    {e}', file=sys.stderr)
        return False


def fetch_text(url, timeout=3.0):
    try:
        with urlopen(url, timeout=timeout) as r:
            if r.status != 200:
                raise RuntimeError(f'HTTP {r.status} from {url}')
            return r.read().decode('utf-8')
    except (URLError, HTTPError) as e:
        raise RuntimeError(f'fetch {url}: {e}') from e


def looks_like_exposition(text):
    if '# HELP' not in text:
        raise RuntimeError('no `# HELP` lines in response — not exposition format')
    if '# TYPE' not in text:
        raise RuntimeError('no `# TYPE` lines in response — not exposition format')
    lines = [l for l in text.split('\n') if l and not l.startswith('#')]
    if not lines:
        raise RuntimeError('no metric lines in response')


def main():
    print(f'Checking {APP_METRICS_URL} …')
    ok1 = check('app /metrics returns 200', lambda: fetch_text(APP_METRICS_URL))
    ok2 = check('app /metrics is valid exposition format',
                lambda: looks_like_exposition(fetch_text(APP_METRICS_URL)))

    print(f'\nChecking agent at {AGENT_METRICS_URL} …')
    ok3 = check('agent is running and exposes its own /metrics',
                lambda: fetch_text(AGENT_METRICS_URL))

    def check_agent_up():
        text = fetch_text(AGENT_METRICS_URL)
        m = re.search(r'^up\{[^}]*job="app"[^}]*\} (\d+)', text, re.MULTILINE)
        if not m:
            raise RuntimeError('agent has no up{job="app"} metric — is the scrape_config job_name correct?')
        if m.group(1) != '1':
            raise RuntimeError(f'agent shows up{{job="app"}} = {m.group(1)} — agent can see the target but it is not responding')

    ok4 = check('agent reports up{job="app"}=1', check_agent_up)

    if not all([ok1, ok2, ok3, ok4]):
        sys.exit(1)
    print('\nAll local checks passed. Run check-roundtrip.mjs to verify remote ingestion.')


if __name__ == '__main__':
    main()
