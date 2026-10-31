import copy
import json
import pathlib
import sys
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import runtime_plan as plan
import runtime_controller as runtime


class RuntimePlanTests(unittest.TestCase):
    def test_vm_is_single_private_bounded_and_contains_no_credential(self):
        source = 'a' * 40
        images = {kind: f'us-east4-docker.pkg.dev/{plan.PROJECT}/cloud-run-source-deploy/xroga-b15-{kind}-stage@sha256:' + 'b' * 64 for kind in ('api', 'browser', 'proxy')}
        body = plan.vm_body(source, images, time.time() + 5400)
        self.assertEqual(body['machineType'].split('/')[-1], 'e2-medium')
        self.assertEqual(body['networkInterfaces'], [{'network': plan.NETWORK, 'subnetwork': plan.SUBNET}])
        self.assertTrue(body['disks'][0]['autoDelete'])
        self.assertEqual(body['disks'][0]['initializeParams']['diskSizeGb'], '20')
        self.assertEqual(body['scheduling']['maxRunDuration']['seconds'], '7200')
        self.assertEqual(body['scheduling']['instanceTerminationAction'], 'DELETE')
        self.assertEqual(body['serviceAccounts'][0]['email'], plan.HOST_SA)
        self.assertNotIn('SUPABASE_SERVICE_ROLE_KEY', json.dumps(body))
        with self.assertRaises(RuntimeError):
            plan.vm_body(source, images, time.time() - 1)

    def test_route_cleanup_preserves_concurrent_default_and_voice_changes(self):
        original = {'fingerprint': 'one', 'defaultService': 'main',
            'hostRules': [{'hosts': ['api.xroga.com'], 'pathMatcher': 'api'}],
            'pathMatchers': [{'name': 'api', 'defaultService': 'main', 'pathRules': [
                {'paths': ['/api/voice/transcribe-free'], 'service': 'voice-current'}]}]}
        added = plan.add_routes(original)
        self.assertEqual(len(added['pathMatchers'][0]['pathRules']), 2)
        added['fingerprint'] = 'two'
        added['pathMatchers'][0]['pathRules'][0]['service'] = 'voice-newer'
        removed = plan.remove_routes(added)
        self.assertEqual(removed['fingerprint'], 'two')
        self.assertEqual(removed['pathMatchers'][0]['pathRules'], [{'paths': ['/api/voice/transcribe-free'], 'service': 'voice-newer'}])
        with self.assertRaises(RuntimeError):
            plan.add_routes(added)
        added['pathMatchers'][0]['pathRules'][1]['service'] = 'someone-elses-backend'
        with self.assertRaises(RuntimeError):
            plan.remove_routes(added)

    def test_stage_identity_and_resource_limits_never_select_production(self):
        body = plan.api_body('a' * 40, 'immutable-fixture', 'https://private-stage.example')
        template = body['template']
        self.assertEqual(template['serviceAccount'], plan.STAGE_SA)
        self.assertEqual(template['timeout'], '900s')
        self.assertEqual(template['scaling'], {'minInstanceCount': 0, 'maxInstanceCount': 2})
        self.assertEqual(template['maxInstanceRequestConcurrency'], 1)
        variables = {x['name']: x.get('value') for x in template['containers'][0]['env']}
        self.assertEqual(variables['XROGA_RELEASE_CANDIDATE'], '1')
        self.assertEqual(variables['XROGA_GOOGLE_CLOUD_KMS_KEY_NAME'], plan.KEY)
        self.assertEqual(variables['XROGA_GOOGLE_CLOUD_AUTH_MODE'], 'metadata_adc')
        self.assertIn("STORAGE_QUOTA_BYTES:'500000000'", plan.api_entrypoint())
        self.assertIn("XROGA_BROWSER_DISPATCH_DEADLINE_SECONDS:'900'", plan.api_entrypoint())
        self.assertEqual(template['volumes'][0]['secret']['items'][0]['version'], '2')

    def test_bundle_validation_rejects_customer_destination_and_missing_drive(self):
        env = {'SUPABASE_URL': 'https://dqxnatoessviphudbhei.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY': 'synthetic',
            'XROGA_DRIVE_R2_BUCKET': 'xroga-drive-test', 'XROGA_DRIVE_R2_ACCOUNT_ID': 'synthetic',
            'XROGA_DRIVE_R2_ACCESS_KEY_ID': 'synthetic', 'XROGA_DRIVE_R2_SECRET_ACCESS_KEY': 'synthetic',
            'DATABASE_URL': 'postgresql://postgres.dqxnatoessviphudbhei:synthetic@pooler.example/postgres'}
        bundle = {'schemaVersion': 1, 'target': 'xroga-api-google', 'environment': env}
        self.assertFalse(runtime.validate_stage_bundle(json.dumps(bundle).encode())['valuesSaved'])
        for key, value in [('SUPABASE_URL', 'https://production.example'), ('XROGA_DRIVE_R2_BUCKET', 'xroga-private-files'),
                           ('DATABASE_URL', 'postgresql://postgres:synthetic@production.example/postgres'),
                           ('XROGA_DRIVE_R2_SECRET_ACCESS_KEY', '')]:
            modified = copy.deepcopy(bundle)
            modified['environment'][key] = value
            with self.assertRaises(RuntimeError):
                runtime.validate_stage_bundle(json.dumps(modified).encode())

    def test_wrong_project_and_production_mutations_never_get_token(self):
        window = {'cleanupEpoch': time.time() + 600, 'cleaning': False}
        with patch.object(runtime, 'read', return_value=window), \
             patch.object(runtime.build, 'token', side_effect=AssertionError('must not get credential')):
            for url, method, body in [
                ('https://example.com/projects/' + plan.PROJECT + '/', 'GET', None),
                (runtime.R + '/services/xroga-api', 'DELETE', None),
                (runtime.S + '/xroga-platform-production', 'DELETE', None),
                (runtime.K, 'DELETE', None),
                (runtime.I, 'POST', {'accountId': 'unapproved-account'})]:
                with self.assertRaises(RuntimeError):
                    runtime.api(url, method, body)


if __name__ == '__main__':
    unittest.main()
