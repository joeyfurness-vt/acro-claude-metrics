#!/usr/bin/env python3
"""check-cardinality.py — Python equivalent of check-cardinality.mjs."""
import os
import re
import sys
from urllib.request import urlopen

METRICS_PORT = os.environ.get('METRICS_PORT', '9100')
PER_METRIC_LIMIT = 50
TOTAL_LIMIT = 5000

text = urlopen(f'http://localhost:{METRICS_PORT}/metrics').read().decode('utf-8')
metric_lines = [l for l in text.split('\n') if l and not l.startswith('#')]

per_metric = {}
for line in metric_lines:
    m = re.match(r'^([a-zA-Z_:][a-zA-Z0-9_:]*)', line)
    if m:
        per_metric[m.group(1)] = per_metric.get(m.group(1), 0) + 1

total = len(metric_lines)
problems = 0

flag = ' ⚠ exceeds ' + str(TOTAL_LIMIT) if total > TOTAL_LIMIT else ''
print(f'Total series: {total}{flag}')
if total > TOTAL_LIMIT:
    problems += 1

offenders = [(n, c) for n, c in per_metric.items() if c > PER_METRIC_LIMIT]
if not offenders:
    print(f'No single metric exceeds {PER_METRIC_LIMIT} series.')
else:
    print(f'\n⚠ Metrics over {PER_METRIC_LIMIT} series:')
    for name, count in sorted(offenders, key=lambda x: -x[1]):
        print(f'  {name}: {count}')
    print('\nLikely cause: a label with high cardinality (user_id, email, free-form string, timestamp).')
    print('Fix: drop the offending label, or constrain it to a small enum.')
    problems += 1

if problems > 0:
    sys.exit(1)
