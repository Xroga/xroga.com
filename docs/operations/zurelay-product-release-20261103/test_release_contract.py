import datetime
import unittest
from release_contract import (SOURCE, FRONTEND, RECOVERY, RECOVERY_DIGEST, PACKAGE,
    configure_container, verify_container, require_approval, permit_model_acceptance)


class ReleaseContractTests(unittest.TestCase):
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
                 maximumCombinedModelResearchUsd=.1, maximumModelRequests=11,
                 maximumResearchRequests=1, maximumNewChats=6, maximumMaintenanceMinutes=60,
                 automaticRetries=0, singletonFenceSqlApproved=True, existingKeyLimitChangeApproved=True,
                 expiresAtUtc=(now + datetime.timedelta(hours=1)).isoformat())
        return now, a

    def test_exact_new_approval_required(self):
        now, a = self.approval()
        require_approval(a, now)
        for delta in ({'approved': False}, {'sourceSha': 'old'}, {'frontendSha': 'old'},
                      {'maximumModelRequests': 12}, {'maximumGoogleUsd': 1},
                      {'singletonFenceSqlApproved': False}, {'existingKeyLimitChangeApproved': False},
                      {'expiresAtUtc': (now - datetime.timedelta(seconds=1)).isoformat()}):
            with self.assertRaises(AssertionError):
                require_approval(dict(a, **delta), now)

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
                      {'modelRequests': 11}, {'historicalHolds': {}}):
            with self.assertRaises(AssertionError):
                permit_model_acceptance(dict(receipt, **delta), 'saas', 1000, now)


if __name__ == '__main__':
    unittest.main()
