"""No cloud calls. Exercise mandatory-gate refusal paths before release."""
import copy
import unittest
from release_gates import REQUIRED, SOURCE, validate

class ReleaseGateTests(unittest.TestCase):
    def setUp(self):
        self.rows = [dict(name=n, id=i, head_sha=SOURCE, status='completed',
                          conclusion='success', html_url='https://github.com/check/'+str(i))
                     for i,n in enumerate(REQUIRED, 1)]
    def test_all_required_pass(self):
        self.assertEqual(len(validate(self.rows)), len(REQUIRED))
    def test_missing_or_nonpassing_gate_refused(self):
        for index in range(len(REQUIRED)):
            with self.subTest(gate=REQUIRED[index]):
                with self.assertRaises(RuntimeError):
                    validate(self.rows[:index]+self.rows[index+1:])
                for conclusion in ('skipped', 'failure', 'cancelled', None):
                    rows=copy.deepcopy(self.rows); rows[index]['conclusion']=conclusion
                    with self.assertRaises(RuntimeError): validate(rows)
    def test_wrong_source_refused(self):
        self.rows[0]['head_sha']='different-source'
        with self.assertRaises(RuntimeError): validate(self.rows)
    def test_new_pending_attempt_overrides_old_success(self):
        self.rows.append(dict(self.rows[0], id=1000, status='in_progress', conclusion=None))
        with self.assertRaises(RuntimeError): validate(self.rows)
    def test_pending_status_cannot_claim_success(self):
        self.rows[0]['status']='in_progress'
        with self.assertRaises(RuntimeError): validate(self.rows)

if __name__ == '__main__': unittest.main()
