"""Exercise the exact approval assertions without importing operational scripts."""
import ast
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE = 'fd3b663290cf150da51768171021860b032df025'
PACKAGE = 'response-v2-webhook-correction-fd3b6632'

class ExactApprovalTests(unittest.TestCase):
    def check(self, file, receipt):
        tree = ast.parse((ROOT / file).read_text())
        guard = next(n for n in tree.body if isinstance(n, ast.Assert)
                     and 'packageId' in ast.unparse(n))
        exec(compile(ast.Module(body=[guard], type_ignores=[]), file, 'exec'),
             {'approval': receipt, 'a': receipt, 'SHA': SOURCE, 'NEW_SHA': SOURCE})

    def test_current_receipt_only(self):
        current = dict(approved=True, sourceSha=SOURCE, packageId=PACKAGE,
                       webhookCorrectionApproved=True)
        for file in ('submit-build.py', 'candidate.py', 'cutover.py'):
            with self.subTest(file=file):
                self.check(file, current)
                for delta in ({'approved': False}, {'sourceSha': 'old'},
                              {'packageId': '84264961107e6642ffe21d61380b479f7f117da9'},
                              {'webhookCorrectionApproved': False}):
                    with self.assertRaises(AssertionError):
                        self.check(file, dict(current, **delta))

if __name__ == '__main__':
    unittest.main()
