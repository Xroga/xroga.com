"""Fail closed on every mandatory release-source gate. Read-only GitHub checks."""
import json
import subprocess

SOURCE = '76c158aaeecf82f524659454b7b3726b4d255679'
REQUIRED = ('unit', 'build', 'authenticated-browser', 'deterministic-golden',
            'structured-mission-policy', 'disposable-policy-database', 'integrated-candidate')

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

def require_release_ci(source=SOURCE):
    payload = subprocess.check_output([
        'gh', 'api', '--paginate', '--slurp',
        'repos/Xroga/xroga.com/commits/' + source + '/check-runs?per_page=100'
    ], text=True, timeout=60)
    return validate([c for page in json.loads(payload) for c in page['check_runs']], source)

def require_pair_ci():
    from release_contract import FRONTEND, RECOVERY
    return {'backend': require_release_ci(), 'frontend': require_release_ci(FRONTEND),
            'compatibleRecovery': require_release_ci(RECOVERY)}

if __name__ == '__main__':
    print(json.dumps({'source': SOURCE, 'checks': require_release_ci()}))
