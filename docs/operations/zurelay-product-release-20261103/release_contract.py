"""Offline release/configuration contract. Importing this file performs no I/O.

These builders operate on manifests held in RAM. Never print their return values,
which can contain the preserved application's existing configuration.
"""
import copy
import datetime
import re

PROJECT = 'project-c40d4821-e647-4fa2-92d'
REGION = 'us-east4'
SOURCE = '76c158aaeecf82f524659454b7b3726b4d255679'
FRONTEND = '3823f51dcd674c00eacd09e6bdf2743ac093a65b'
BASELINE = 'cd5541c6c887a11ba68aaf3cccfb78609f906167'
RECOVERY = '3bed89e65411fea9376bce0da8aacd1bd8c72f92'
RECOVERY_DIGEST = 'sha256:b060ee406046c1e62f192bdd52d830225a9dd816f3c9f4202168fc6e6bead007'
REPOSITORY = f'us-east4-docker.pkg.dev/{PROJECT}/cloud-run-source-deploy/xroga-api-release@'
IDENTITY = f'xroga-api-runtime@{PROJECT}.iam.gserviceaccount.com'
PACKAGE = 'zurelay-product-76c158aa-20261103'
MODELS = 'deepseek_v4_1_flash_1017,claude_sonnet_5_5'


def require_approval(value, now, recovering=False):
    assert value.get('approved') is True, 'NEW_OWNER_DECISION_REQUIRED'
    assert value.get('packageId') == PACKAGE and value.get('sourceSha') == SOURCE, 'SOURCE_APPROVAL_MISMATCH'
    assert value.get('frontendSha') == FRONTEND and value.get('recoverySha') == RECOVERY, 'PAIR_APPROVAL_MISMATCH'
    expected = {'maximumGoogleUsd': .50, 'maximumImageUsdPerMonth': .10,
                'maximumCombinedModelResearchUsd': .10, 'maximumModelRequests': 11,
                'maximumResearchRequests': 1, 'maximumNewChats': 6,
                'maximumMaintenanceMinutes': 60, 'automaticRetries': 0}
    assert all(value.get(k) == v for k, v in expected.items()), 'BOUND_CHANGED'
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
              'XROGA_DISABLED_PROVIDERS': 'openrouter,moonshot,zhipu,xai,gemini',
              'ZURELAY_JSON_SCHEMA_VERIFIED': '0'}
    if candidate:
        policy['XROGA_RELEASE_CANDIDATE'] = '1'
    replaced = set(policy) | {'XROGA_RELEASE_CANDIDATE', 'ZURELAY_API_KEY', 'XROGA_MODEL_FALLBACK_ORDER'}
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
                           ('XROGA_DEPLOYMENT_ENVIRONMENT', 'production'),
                           ('XROGA_DISABLED_PROVIDERS', 'openrouter,moonshot,zhipu,xai,gemini')]:
        assert e[name].get('value') == expected, 'POLICY_DRIFT_' + name
    assert (e.get('XROGA_RELEASE_CANDIDATE', {}).get('value') == '1') == candidate, 'STARTUP_GUARD_DRIFT'
    key = e['ZURELAY_API_KEY']
    assert 'value' not in key, 'LITERAL_KEY_REFUSED'
    assert key.get('valueSource', key.get('valueFrom')) in (
        {'secretKeyRef': {'secret': 'xroga_models_zurelay', 'version': '1'}},
        {'secretKeyRef': {'name': 'xroga_models_zurelay', 'key': '1'}}), 'SECRET_REF_DRIFT'
    assert 'XROGA_MODEL_FALLBACK_ORDER' not in e, 'FALLBACK_CONFIG_REFUSED'


def permit_model_acceptance(receipt, expected_prompt, next_request_ceiling_micro, now):
    """A journal/receipt check, never an alternative to canonical ledger admission."""
    assert receipt['packageId'] == PACKAGE and receipt['sourceSha'] == SOURCE
    assert receipt['nextPrompt'] == expected_prompt and receipt['submittedPrompts'].count(expected_prompt) == 0, 'NO_MANUAL_RETRY'
    assert receipt['unknownNewUsageMicroUsd'] == 0 and receipt['previousAcceptancePassed'] is True, 'STOP_ON_FAILED_OR_UNKNOWN'
    assert receipt['historicalHolds'] == {'kimiMicroUsd': 38282, 'glmMicroUsd': 1385}, 'HISTORICAL_HOLD_CHANGED'
    assert 0 < next_request_ceiling_micro <= 100000 - receipt['spentAndReservedMicroUsd'], 'ACCEPTANCE_BUDGET_DENIED'
    requested = 1 if expected_prompt == 'sonnet' else 2
    assert receipt['modelRequests'] + requested <= 11, 'REQUEST_COUNT_DENIED'
    assert receipt['researchRequests'] + (1 if expected_prompt == 'research' else 0) <= 1, 'SEARCH_COUNT_DENIED'
    assert len(receipt['submittedPrompts']) < 6, 'CHAT_COUNT_DENIED'
    assert now < datetime.datetime.fromisoformat(receipt['deadlineUtc']), 'ACCEPTANCE_EXPIRED'
