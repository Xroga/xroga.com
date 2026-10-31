import base64
import contextlib
import copy
import importlib.util
import io
import json
import pathlib
import time
import unittest
import zlib
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('host_bootstrap', pathlib.Path(__file__).with_name('host_bootstrap.py'))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


def configuration():
    return {'project': host.PROJECT, 'hostAccount': host.HOST_ACCOUNT, 'source': 'a' * 40,
        'cleanupEpoch': time.time() + 5400,
        'helpers': [{'name': name} for name in ('run-sandbox-probe.mjs', 'verify-egress-isolation.mjs')],
        'images': {kind: f'{host.REGISTRY}/xroga-b15-{kind}-stage@sha256:' + 'b' * 64 for kind in ('api', 'browser', 'proxy')}}


class HostBoundaryTests(unittest.TestCase):
    def test_only_exact_private_host_and_immutable_source_images_admitted(self):
        host.validate(configuration())
        for field, value in [('project', 'other'), ('hostAccount', 'production@example.com'), ('source', 'main'),
                             ('cleanupEpoch', time.time() - 1), ('cleanupEpoch', time.time() + 9000), ('helpers', [])]:
            bad = configuration()
            bad[field] = value
            with self.assertRaises(RuntimeError):
                host.validate(bad)
        for kind in ('api', 'browser', 'proxy'):
            bad = configuration()
            bad['images'][kind] = 'untrusted.example/image:latest'
            with self.assertRaises(RuntimeError):
                host.validate(bad)

    def test_invalid_scope_never_runs_a_command_or_reads_a_credential(self):
        bad = configuration()
        bad['project'] = 'other'
        with patch.object(host, 'command', side_effect=AssertionError('no command')), \
             patch.object(host, 'metadata', side_effect=AssertionError('no credential')):
            with self.assertRaisesRegex(RuntimeError, 'SCOPE_MISMATCH'):
                host.main(bad)

    def test_evidence_is_bounded_and_refuses_known_tokens(self):
        with patch.object(host, 'SENSITIVE', ['synthetic-secret-canary']):
            with self.assertRaisesRegex(RuntimeError, 'SECRET_FOUND'):
                host.safe_report({'result': 'synthetic-secret-canary'})
            with self.assertRaisesRegex(RuntimeError, 'TOO_LARGE'):
                host.safe_report({'result': 'x' * 180001})
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                host.safe_report({'status': 'SAFE_TEST'})
            encoded = output.getvalue().strip().split('=', 1)[1]
            self.assertEqual(json.loads(zlib.decompress(base64.b64decode(encoded))), {'status': 'SAFE_TEST'})

    def test_crc32c_matches_published_check_vector(self):
        self.assertEqual(host.crc32c(b'123456789'), 0xe3069283)


if __name__ == '__main__':
    unittest.main()
