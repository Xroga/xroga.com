"""Offline payload regressions. No cloud, SQL, credentials or provider calls."""
import ast
import copy
import json
import pathlib
import tempfile
import unittest
from release_contract import (SOURCE, RECOVERY, RECOVERY_DIGEST, REPOSITORY, IDENTITY,
    configure_container, verify_container)

ROOT = pathlib.Path(__file__).resolve().parent
TREE = ast.parse((ROOT / 'cutover.py').read_text())
CHAIN = next(n for n in TREE.body if isinstance(n, ast.If) and ast.unparse(n.test) == "MODE == 'preflight'")


class CutoverPayloadTests(unittest.TestCase):
    def test_operational_scripts_compile_without_importing_or_executing(self):
        for path in ROOT.glob('*.py'):
            with self.subTest(path=path.name):
                compile(path.read_text(), str(path), 'exec')

    def test_every_mutation_writer_requires_the_new_exact_approval(self):
        for name in ['submit-build.py', 'candidate.py', 'cutover.py']:
            source = (ROOT / name).read_text()
            tree = ast.parse(source)
            guarded = [n for n in tree.body if isinstance(n, ast.Expr)
                and isinstance(n.value, ast.Call) and isinstance(n.value.func, ast.Name)
                and n.value.func.id == 'require_approval']
            self.assertEqual(len(guarded), 1, name)
            self.assertIn("RELEASE-APPROVED.json", source)
            self.assertNotIn("PROBE-APPROVED.json", source)

    def run_job_stage(self, recovering):
        digest = 'sha256:' + 'a' * 64
        current_source = SOURCE if recovering else 'cd5541c6c887a11ba68aaf3cccfb78609f906167'
        old_image = REPOSITORY + 'sha256:' + 'b' * 64
        c = {'image': old_image, 'command': ['node', 'dist/scripts/runCanonicalWorker.js'],
             'env': [{'name': 'XROGA_GCE_BASE_IMAGE_ID', 'value': '5308884476316794212'},
                     {'name': 'VOICE_SETTING', 'value': 'preserve'},
                     {'name': 'XROGA_GOOGLE_WORKER_IMAGE', 'value': old_image}]}
        if recovering:
            c = configure_container(c, SOURCE, digest)
        job = {'etag': 'unchanged-etag', 'annotations': {'existing': 'keep'},
               'labels': {'xroga-source-sha': current_source},
               'template': {'template': {'containers': [c], 'serviceAccount': IDENTITY,
                   'timeout': '1800s', 'vpcAccess': {'networkInterfaces': [{'subnetwork': 'existing'}]}}}}
        state = copy.deepcopy(job)
        requests = []

        def run(path, method='GET', body=None):
            if method == 'PATCH':
                requests.append((path, copy.deepcopy(body)))
                self.assertEqual(body['etag'], 'unchanged-etag')
                if 'validateOnly=true' not in path:
                    state.update(copy.deepcopy(body))
                return {'done': True}
            return copy.deepcopy(state)

        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            ready = ('response-recovery-serving-private-ready.json' if recovering else 'response-serving-private-ready.json')
            (root / ready).write_text(json.dumps({'state': 'PASS_PRIVATE_READINESS',
                'revision': 'recovery-revision' if recovering else 'new-revision'}))
            env = dict(MODE='recover-job' if recovering else 'job', ROOT=root, json=json,
                copy=copy, NEW='new-revision', NEW_SHA=SOURCE, NEW_IMAGE=REPOSITORY + digest,
                RECOVERY=RECOVERY, RECOVERY_IMAGE=REPOSITORY + RECOVERY_DIGEST,
                RECOVERY_REV='recovery-revision', OLD_IMAGE=old_image,
                OLD_SHA='cd5541c6c887a11ba68aaf3cccfb78609f906167', P='project-c40d4821-e647-4fa2-92d',
                JOB='canonical-job', job=job, queue={'state': 'PAUSED'}, run=run,
                fenced=lambda: None, no_executions=lambda: None, wait=lambda op: None,
                record=lambda *a, **kw: None, configure_container=configure_container,
                verify_container=verify_container)
            definition = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'job_config')
            exec(compile(ast.Module(body=[definition, CHAIN], type_ignores=[]), 'cutover.py', 'exec'), env)
        self.assertEqual(len(requests), 2, 'Validate once, mutate once. No execution or retry.')
        expected_source, expected_digest = (RECOVERY, RECOVERY_DIGEST) if recovering else (SOURCE, digest)
        verify_container(state['template']['template']['containers'][0], expected_source, expected_digest)
        self.assertEqual(state['labels']['xroga-source-sha'], expected_source)
        self.assertEqual(state['template']['template']['vpcAccess'], job['template']['template']['vpcAccess'])
        self.assertIn({'name': 'VOICE_SETTING', 'value': 'preserve'}, state['template']['template']['containers'][0]['env'])

    def test_forward_job_payload_preserves_canonical_runtime(self):
        self.run_job_stage(False)

    def test_recovery_job_uses_compatible_zurelay_source_and_secret(self):
        self.run_job_stage(True)

    def test_readiness_paths_are_paths_in_both_serving_modes(self):
        expression = next(n.value.args[0] for n in ast.walk(CHAIN)
            if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'candidate' for t in n.targets))
        # Exercise the actual compiled path/read expression in both branches.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for mode, name in [('serving', 'response-candidate-private-ready.json'),
                               ('recovery-serving', 'response-recovery-candidate-private-ready.json')]:
                (root / name).write_text('{"state":"fixture"}')
                self.assertEqual(eval(compile(ast.Expression(expression), 'cutover.py', 'eval'),
                    {'ROOT': root, 'MODE': mode}), '{"state":"fixture"}')

    def test_recovery_sql_never_reopens_retired_model_source(self):
        sql = (ROOT / '04-recover-current.sql').read_text()
        self.assertIn("allowed_source='" + RECOVERY + "'", sql)
        self.assertNotIn("allowed_source='cd5541", sql)
        self.assertIn('pg_advisory_xact_lock', sql)
        self.assertIn('CANONICAL_FENCE_NOT_PAUSED_AND_DRAINED', sql)
        self.assertNotIn('DELETE', sql.upper())


if __name__ == '__main__':
    unittest.main()
