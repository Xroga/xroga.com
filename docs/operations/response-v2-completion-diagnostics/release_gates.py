"""Fail closed on every mandatory release-source gate. Read-only GitHub checks."""
import json
import subprocess

SOURCE = '4500d039721323ebc5351a9493d1d695e1d3e6e8'
REQUIRED = ('unit', 'build', 'authenticated-browser', 'deterministic-golden',
            'structured-mission-policy', 'disposable-policy-database')

def validate(checks, source=SOURCE):
    receipts = []
    for name in REQUIRED:
        matches = sorted((c for c in checks if c['name'] == name),
                         key=lambda c: c['id'], reverse=True)
        if not matches:
            raise RuntimeError('MISSING_RELEASE_CHECK_' + name)
        latest = matches[0]
        if (latest.get('head_sha') != source or latest.get('status') != 'completed'
                or latest.get('conclusion') != 'success'):
            raise RuntimeError('RELEASE_CHECK_NOT_PASSED_' + name)
        receipts.append({'name': name, 'id': latest['id'], 'url': latest['html_url']})
    return receipts

def require_release_ci():
    payload = subprocess.check_output([
        'gh', 'api', '--paginate', '--slurp',
        'repos/Xroga/xroga.com/commits/' + SOURCE + '/check-runs?per_page=100'
    ], text=True, timeout=60)
    return validate([c for page in json.loads(payload) for c in page['check_runs']])

if __name__ == '__main__':
    print(json.dumps({'source': SOURCE, 'checks': require_release_ci()}))
