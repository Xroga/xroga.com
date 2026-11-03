import datetime
import unittest
import json
import pathlib
import subprocess
from release_contract import (SOURCE, FRONTEND, RECOVERY, RECOVERY_DIGEST, PACKAGE,
    configure_container, verify_container, require_approval, permit_model_acceptance)


class ReleaseContractTests(unittest.TestCase):
    def test_real_protected_loader_rejects_duplicate_and_accepts_corrected_native_manifest(self):
        repo=pathlib.Path(__file__).resolve().parents[3]/'../xroga-response-backend-compatible'
        repo=repo.resolve()
        node=repo/'outputs/zurelay-toolchain/node-v22.21.1-win-x64/node.exe'
        module=(repo/'backend/src/config/platformEnvironment.ts').as_uri()
        c=configure_container({'env':[{'name':'XROGA_PLATFORM_CONFIG_FILE','value':'/secrets/xroga-platform/config.json'},
            {'name':'XROGA_DISABLED_PROVIDERS','value':'old-native-duplicate'}]},SOURCE,'sha256:'+'a'*64,True,True)
        environment={v['name']:v['value'] for v in c['env'] if 'value' in v}
        js="import assert from 'node:assert/strict'; import {parseProtectedPlatformConfiguration as parse} from "+json.dumps(module)+"; const env="+json.dumps(environment)+"; const raw=new TextEncoder().encode(JSON.stringify({schemaVersion:1,target:'xroga-api-google',environment:{XROGA_DISABLED_PROVIDERS:'zhipu',VOICE_SETTING:'preserved'}})); assert.throws(()=>parse(raw,{...env,XROGA_DISABLED_PROVIDERS:'old-native-duplicate'})); assert.equal(parse(raw,env).XROGA_DISABLED_PROVIDERS,'zhipu'); assert.equal(parse(raw,env).VOICE_SETTING,'preserved');"
        result=subprocess.run([str(node),'--experimental-strip-types','--input-type=module','-e',js],cwd=repo,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
        verify_container(c,SOURCE,'sha256:'+'a'*64,True)
        with self.assertRaises(AssertionError):
            verify_container(dict(c,env=c['env']+[{'name':'XROGA_DISABLED_PROVIDERS','value':'zhipu'}]),SOURCE,'sha256:'+'a'*64,True)
        for source in (SOURCE,RECOVERY):
            policy=subprocess.check_output(['git','show',source+':backend/src/ai/providerPolicy.ts'],cwd=repo,text=True)
            self.assertIn("provider !== 'zurelay'",policy)
            self.assertIn("zurelay:{url:ZURELAY_BASE_URL,secret:'ZURELAY_API_KEY'}",policy)

    def test_manifest_versions_preserve_unrelated_configuration(self):
        original = {'image': 'old', 'env': [{'name': 'VOICE_SETTING', 'value': 'keep'},
            {'name': 'ZURELAY_API_KEY', 'value': 'must-be-replaced'},
            {'name': 'XROGA_MODEL_FALLBACK_ORDER', 'value': 'retired'}], 'command': ['node', 'dist/scripts/runCanonicalWorker.js']}
        for source, digest in [(SOURCE, 'sha256:' + 'a' * 64), (RECOVERY, RECOVERY_DIGEST)]:
            for v1 in (False, True):
                for candidate in (False, True):
                    c = configure_container(original, source, digest, candidate, v1)
                    verify_container(c, source, digest, candidate)
                    self.assertEqual(c['env'][0], original['env'][0])
                    self.assertEqual(c['command'], original['command'])
        self.assertEqual(original['image'], 'old')

    def test_retired_rollback_and_mutable_reference_refused(self):
        for source, digest in [('cd5541', RECOVERY_DIGEST), (SOURCE, 'latest'), (RECOVERY, 'sha256:' + 'a' * 64)]:
            with self.assertRaises(AssertionError):
                configure_container({}, source, digest)

    def test_drift_refused(self):
        c = configure_container({}, SOURCE, 'sha256:' + 'a' * 64, True)
        for delta in ({'name': 'ZURELAY_API_KEY', 'value': 'secret'}, {'name': 'XROGA_MODEL_FALLBACK_ORDER', 'value': 'glm'}):
            bad = dict(c, env=c['env'] + [delta])
            with self.assertRaises(AssertionError):
                verify_container(bad, SOURCE, 'sha256:' + 'a' * 64, True)

    def approval(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        a = dict(approved=True, packageId=PACKAGE, sourceSha=SOURCE, frontendSha=FRONTEND,
                 recoverySha=RECOVERY, maximumGoogleUsd=.5, maximumImageUsdPerMonth=.1,
                 maximumCombinedModelResearchUsd=.1, maximumModelRequests=13,
                 maximumResearchRequests=1, maximumNewChats=7, maximumMaintenanceMinutes=60,
                 automaticRetries=0, singletonFenceSqlApproved=True, existingKeyLimitChangeApproved=True,
                 cumulativeAllowanceOnly=True, maximumAdditionalBuilds=0, maximumProviderRequestsPerMinute=6,
                 expiresAtUtc=(now + datetime.timedelta(hours=1)).isoformat())
        return now, a

    def test_exact_new_approval_required(self):
        now, a = self.approval()
        require_approval(a, now)
        for delta in ({'approved': False}, {'activationHold': 'FRONTEND_PRODUCTION_DRIFT'}, {'sourceSha': 'old'}, {'frontendSha': 'old'},
                      {'maximumModelRequests': 12}, {'maximumGoogleUsd': 1},
                      {'cumulativeAllowanceOnly': False}, {'maximumAdditionalBuilds': 1},
                      {'maximumProviderRequestsPerMinute': 7},
                      {'singletonFenceSqlApproved': False}, {'existingKeyLimitChangeApproved': False},
                      {'expiresAtUtc': (now - datetime.timedelta(seconds=1)).isoformat()}):
            with self.assertRaises(AssertionError):
                require_approval(dict(a, **delta), now)

    def test_superseded_frontend_pins_cannot_promote(self):
        from release_contract import require_frontend_release
        now, a = self.approval()
        require_frontend_release({'service':'xroga-web','environment':'production','release':FRONTEND})
        for old in ['63a6c6129d8a1e3ef998f4e7fce13e8d00c17c2b','7760f91c80a4a10471963cb0efc05a9f0af0beb3','f62ca1f3f70150040d829b2ee48f93192feff9c2','2f80a744a406eb2ab7e86538bc382cc3000ef730','f5f70ae3b47fb583dfdbf08ae0f9831028dc6238']:
            with self.assertRaises(AssertionError):
                require_approval(dict(a, frontendSha=old), now)
            with self.assertRaises(AssertionError):
                require_frontend_release({'service':'xroga-web','environment':'production','release':old})

    def test_unknown_usage_and_replay_stop_acceptance(self):
        now, a = self.approval()
        receipt = dict(packageId=PACKAGE, sourceSha=SOURCE, nextPrompt='saas', submittedPrompts=[],
                       unknownNewUsageMicroUsd=0, previousAcceptancePassed=True,
                       historicalHolds={'kimiMicroUsd': 38282, 'glmMicroUsd': 1385},
                       spentAndReservedMicroUsd=0, modelRequests=0, researchRequests=0,
                       deadlineUtc=a['expiresAtUtc'])
        permit_model_acceptance(receipt, 'saas', 1000, now)
        for delta in ({'unknownNewUsageMicroUsd': 1}, {'previousAcceptancePassed': False},
                      {'submittedPrompts': ['saas']}, {'spentAndReservedMicroUsd': 99999},
                      {'modelRequests': 13}, {'historicalHolds': {}}):
            with self.assertRaises(AssertionError):
                permit_model_acceptance(dict(receipt, **delta), 'saas', 1000, now)

    def test_rate_recheck_exception_never_certifies_the_failed_attempt_or_allows_another_retry(self):
        now, a = self.approval()
        receipt = dict(packageId=PACKAGE, sourceSha=SOURCE, nextPrompt='saas-rate-recheck',
            submittedPrompts=['saas'], unknownNewUsageMicroUsd=0, previousAcceptancePassed=False,
            historicalHolds={'kimiMicroUsd':38282,'glmMicroUsd':1385}, spentAndReservedMicroUsd=188,
            modelRequests=2, researchRequests=0, deadlineUtc=a['expiresAtUtc'],
            rateRecheckExplicitlyApproved=True, priorFailedRequestId='req_BuVn7BX9g8U8tSYAK6jYhcwi')
        permit_model_acceptance(receipt, 'saas-rate-recheck', 1000, now)
        for delta in ({'rateRecheckExplicitlyApproved':False}, {'priorFailedRequestId':'unknown'},
                      {'unknownNewUsageMicroUsd':1}, {'submittedPrompts':['saas','saas-rate-recheck']}):
            with self.assertRaises(AssertionError):
                permit_model_acceptance(dict(receipt,**delta), 'saas-rate-recheck', 1000, now)
        with self.assertRaises(AssertionError):
            permit_model_acceptance(dict(receipt,nextPrompt='workshop'), 'workshop', 1000, now)


if __name__ == '__main__':
    unittest.main()
