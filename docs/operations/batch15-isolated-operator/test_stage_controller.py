import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('stage_controller', pathlib.Path(__file__).with_name('stage_controller.py'))
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)
SHA = 'a' * 40


class BuildBoundaryTests(unittest.TestCase):
    def test_founder_hold_prevents_build_before_ci_or_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(controller, 'ROOT', pathlib.Path(temporary)), \
                 patch.object(controller, 'ci_gate', side_effect=AssertionError('no new CI work')), \
                 patch.object(controller, 'api', side_effect=AssertionError('no cloud spending')):
                controller.save('FOUNDER-COURSE-CORRECTION.json', {'browserPackageHeld': True})
                with self.assertRaisesRegex(RuntimeError, 'BROWSER_PACKAGE_HELD_BY_FOUNDER'):
                    controller.submit_build(SHA)
    def test_source_and_build_limits_are_fixed(self):
        for source in ('main', '', 'a' * 39, 'a' * 40 + ';bad', '../production'):
            with self.assertRaises(RuntimeError):
                controller.build_plan(source)
        plan = controller.build_plan(SHA)
        self.assertEqual(plan['timeout'], '1800s')
        self.assertEqual(len(plan['images']), 3)
        self.assertTrue(all(image.startswith(controller.REGISTRY + '/xroga-b15-') for image in plan['images']))
        self.assertTrue(all(image.endswith(':' + SHA) for image in plan['images']))
        self.assertEqual(plan['steps'][2]['args'][-1], SHA)
        self.assertFalse(any('secret' in key.lower() for key in plan))
        self.assertNotIn('production', json.dumps(plan))

    def test_missing_or_failed_exact_source_ci_prevents_build(self):
        head = json.dumps({'headRefOid': SHA})
        passing = [{'name': name, 'state': 'SUCCESS'} for name in controller.REQUIRED]
        for checks in ([], passing[:-1], [{**x, 'state': 'FAILURE'} for x in passing]):
            with patch.object(controller.subprocess, 'check_output', side_effect=[head, json.dumps(checks)]):
                with self.assertRaisesRegex(RuntimeError, 'REQUIRED_CI_NOT_PASS'):
                    controller.ci_gate(SHA)
        with patch.object(controller.subprocess, 'check_output', return_value=json.dumps({'headRefOid': 'b' * 40})):
            with self.assertRaisesRegex(RuntimeError, 'PINNED_SOURCE'):
                controller.ci_gate(SHA)
        with patch.object(controller.subprocess, 'check_output', side_effect=[head, json.dumps(passing)]):
            self.assertEqual(controller.ci_gate(SHA)['source'], SHA)

    def test_other_project_origin_or_mutation_never_requests_a_token(self):
        with patch.object(controller, 'token', side_effect=AssertionError('must not get credential')):
            for url, method in (
                ('https://example.com/', 'GET'),
                ('https://cloudbuild.googleapis.com/v1/projects/other/locations/us-east4/builds', 'POST'),
                (f'https://artifactregistry.googleapis.com/v1/projects/{controller.PROJECT}/locations/us-east4/repositories', 'DELETE'),
            ):
                with self.assertRaises(RuntimeError):
                    controller.api(url, method)

    def test_existing_or_uncertain_submission_is_not_replayed(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(controller, 'ROOT', pathlib.Path(temporary)), \
                 patch.object(controller, 'approval', return_value={'approved': True}), \
                 patch.object(controller, 'ci_gate', return_value={'source': SHA}), \
                 patch.object(controller, 'api', side_effect=AssertionError('no new billable operation')):
                controller.save('build-journal.json', {'status': 'SUBMIT_INTENT'})
                with self.assertRaisesRegex(RuntimeError, 'BUILD_INTENT_EXISTS'):
                    controller.submit_build(SHA)

    def test_wrong_package_or_spending_allowance_is_not_approved(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(controller, 'ROOT', pathlib.Path(temporary)):
                for package, dollars, model in (('b' * 40, 2, 0), (controller.PACKAGE, 3, 0), (controller.PACKAGE, 2, 1)):
                    controller.save('APPROVED-WINDOW.json', {'approved': True, 'packageCommit': package,
                        'maximumGrossUsd': dollars, 'modelSpendUsd': model, 'maximumWindowSeconds': 7200})
                    with self.assertRaisesRegex(RuntimeError, 'EXACT_APPROVAL_REQUIRED'):
                        controller.approval()


if __name__ == '__main__':
    unittest.main()
