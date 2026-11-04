"""Offline release/configuration contract. Importing this file performs no I/O.

These builders operate on manifests held in RAM. Never print their return values,
which can contain the preserved application's existing configuration.
"""
import copy
import datetime
import re

PROJECT = 'project-c40d4821-e647-4fa2-92d'
REGION = 'us-east4'
SOURCE = '1a642656542b2e806550b4c7b68517c9df51b22f'
FRONTEND = '1a642656542b2e806550b4c7b68517c9df51b22f'
BASELINE = '3bed89e65411fea9376bce0da8aacd1bd8c72f92'
RECOVERY = '3bed89e65411fea9376bce0da8aacd1bd8c72f92'
RECOVERY_DIGEST = 'sha256:b060ee406046c1e62f192bdd52d830225a9dd816f3c9f4202168fc6e6bead007'
REPOSITORY = f'us-east4-docker.pkg.dev/{PROJECT}/cloud-run-source-deploy/xroga-api-release@'
IDENTITY = f'xroga-api-runtime@{PROJECT}.iam.gserviceaccount.com'
PACKAGE = 'zurelay-two-model-1a642656-20261104'
MODELS = 'deepseek_v4_1_flash_1017,claude_sonnet_5_5'


def require_frontend_release(value):
    assert value.get('service') == 'xroga-web' and value.get('environment') == 'production', 'FRONTEND_TARGET_MISMATCH'
    assert value.get('release') == FRONTEND, 'COMPATIBLE_FRONTEND_NOT_LIVE'


def require_approval(value, now, recovering=False):
    assert value.get('approved') is True, 'NEW_OWNER_DECISION_REQUIRED'
    if not recovering:
        assert not value.get('activationHold'), 'RELEASE_SAFETY_HOLD_REQUIRES_REVIEW'
    assert value.get('packageId') == PACKAGE and value.get('sourceSha') == SOURCE, 'SOURCE_APPROVAL_MISMATCH'
    assert value.get('frontendSha') == FRONTEND and value.get('recoverySha') == RECOVERY, 'PAIR_APPROVAL_MISMATCH'
    expected = {'maximumGoogleUsd': .50, 'maximumImageUsdPerMonth': .10,
                'maximumCombinedModelResearchUsd': .05, 'maximumModelRequests': 12,
                'maximumResearchRequests': 0, 'maximumNewChats': 6,
                'maximumMaintenanceMinutes': 60, 'automaticRetries': 0}
    assert all(value.get(k) == v for k, v in expected.items()), 'BOUND_CHANGED'
    assert value.get('cumulativeAllowanceOnly') is True and value.get('maximumAdditionalBuilds') == 1 and value.get('maximumProviderRequestsPerMinute') == 3, 'RATE_RECHECK_SCOPE_MISMATCH'
    assert value.get('singletonFenceSqlApproved') is True and value.get('existingKeyLimitChangeApproved') is True, 'SPECIFIC_CONTROL_APPROVAL_REQUIRED'
    deadline = datetime.datetime.fromisoformat(value['expiresAtUtc'])
    if not recovering:
        assert now < deadline <= now + datetime.timedelta(hours=2), 'RELEASE_WINDOW_INVALID'


def image(source, digest):
    assert source in (SOURCE, RECOVERY), 'RETIRED_SOURCE_NOT_MODEL_SAFE'
    assert re.fullmatch(r'sha256:[a-f0-9]{64}', digest), 'IMMUTABLE_DIGEST_REQUIRED'
    if source == RECOVERY:
        assert digest == RECOVERY_DIGEST, 'RECOVERY_IMAGE_CHANGED'
    return REPOSITORY + digest


def configure_container(original, source, digest, candidate=False, v1=False):
    """Keep unrelated settings and voice credentials, pin only model/release names."""
    target = image(source, digest)
    c = copy.deepcopy(original)
    policy = {'XROGA_RELEASE_SHA': source, 'XROGA_GOOGLE_WORKER_IMAGE': target,
              'XROGA_DEPLOYMENT_ENVIRONMENT': 'production',
              'XROGA_ALLOWED_MODELS': MODELS,
              'ZURELAY_JSON_SCHEMA_VERIFIED': '0'}
    if candidate:
        policy['XROGA_RELEASE_CANDIDATE'] = '1'
    # This existing setting is owned by the protected bundle. Declaring it a
    # second time causes the unchanged startup validator to reject the bundle.
    # The pinned application's providerPolicy independently rejects every
    # provider except Zurelay, regardless of this older availability setting.
    replaced = set(policy) | {'XROGA_RELEASE_CANDIDATE', 'ZURELAY_API_KEY', 'XROGA_MODEL_FALLBACK_ORDER', 'XROGA_DISABLED_PROVIDERS'}
    c['env'] = [e for e in c.get('env', []) if e['name'] not in replaced]
    c['env'] += [{'name': k, 'value': v} for k, v in policy.items()]
    ref = {'secretKeyRef': {'name': 'xroga_models_zurelay', 'key': '1'}} if v1 else {'secretKeyRef': {'secret': 'xroga_models_zurelay', 'version': '1'}}
    c['env'].append({'name': 'ZURELAY_API_KEY', 'valueFrom' if v1 else 'valueSource': ref})
    c['image'] = target
    return c


def verify_container(c, source, digest, candidate=False):
    assert c['image'] == image(source, digest), 'IMAGE_DRIFT'
    entries = c.get('env', [])
    e = {v['name']: v for v in entries}
    assert len(e) == len(entries), 'DUPLICATE_ENV'
    for name, expected in [('XROGA_RELEASE_SHA', source), ('XROGA_GOOGLE_WORKER_IMAGE', image(source, digest)),
                           ('XROGA_ALLOWED_MODELS', MODELS), ('ZURELAY_JSON_SCHEMA_VERIFIED', '0'),
                           ('XROGA_DEPLOYMENT_ENVIRONMENT', 'production')]:
        assert e[name].get('value') == expected, 'POLICY_DRIFT_' + name
    assert (e.get('XROGA_RELEASE_CANDIDATE', {}).get('value') == '1') == candidate, 'STARTUP_GUARD_DRIFT'
    key = e['ZURELAY_API_KEY']
    assert 'value' not in key, 'LITERAL_KEY_REFUSED'
    assert key.get('valueSource', key.get('valueFrom')) in (
        {'secretKeyRef': {'secret': 'xroga_models_zurelay', 'version': '1'}},
        {'secretKeyRef': {'name': 'xroga_models_zurelay', 'key': '1'}}), 'SECRET_REF_DRIFT'
    assert 'XROGA_MODEL_FALLBACK_ORDER' not in e, 'FALLBACK_CONFIG_REFUSED'
    assert 'XROGA_DISABLED_PROVIDERS' not in e, 'PROTECTED_BUNDLE_SETTING_SHADOWED'


def permit_model_acceptance(receipt, expected_prompt, next_request_ceiling_micro, now):
    """A journal/receipt check, never an alternative to canonical ledger admission."""
    assert receipt['packageId'] == PACKAGE and receipt['sourceSha'] == SOURCE
    assert receipt['nextPrompt'] == expected_prompt and receipt['submittedPrompts'].count(expected_prompt) == 0, 'NO_MANUAL_RETRY'
    assert receipt['unknownNewUsageMicroUsd'] == 0, 'STOP_ON_UNKNOWN'
    if expected_prompt == 'saas-rate-recheck':
        assert receipt.get('rateRecheckExplicitlyApproved') is True and receipt.get('priorFailedRequestId') == 'req_BuVn7BX9g8U8tSYAK6jYhcwi', 'SPECIFIC_RATE_RECHECK_DECISION_REQUIRED'
    else:
        assert receipt['previousAcceptancePassed'] is True, 'STOP_ON_FAILED_OR_UNKNOWN'
    assert receipt['historicalHolds'] == {'kimiMicroUsd': 38282, 'glmMicroUsd': 1385}, 'HISTORICAL_HOLD_CHANGED'
    assert 0 < next_request_ceiling_micro <= 100000 - receipt['spentAndReservedMicroUsd'], 'ACCEPTANCE_BUDGET_DENIED'
    requested = 1 if expected_prompt == 'sonnet' else 2
    assert receipt['modelRequests'] + requested <= 13, 'REQUEST_COUNT_DENIED'
    assert receipt['researchRequests'] + (1 if expected_prompt == 'research' else 0) <= 1, 'SEARCH_COUNT_DENIED'
    assert len(receipt['submittedPrompts']) < 7, 'CHAT_COUNT_DENIED'
    assert now < datetime.datetime.fromisoformat(receipt['deadlineUtc']), 'ACCEPTANCE_EXPIRED'
