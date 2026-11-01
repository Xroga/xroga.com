"""Exercise fence and API/Job pairing guards without contacting production."""
import ast, datetime, json, pathlib, tempfile, time, unittest
SOURCE=pathlib.Path(__file__).with_name('cutover.py')
module=ast.parse(SOURCE.read_text())
functions=ast.Module(body=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name in ['fenced','live','job_config']],type_ignores=[])

class CutoverGuardTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.root=pathlib.Path(self.tmp.name)
  self.ns={'ROOT':self.root,'datetime':datetime,'time':time,'json':json,'MODE':'promote','P':'project-test'}
  exec(compile(functions,str(SOURCE),'exec'),self.ns)
  self.write('response-maintenance-window.json',{'deadlineUtc':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=5)).isoformat()})
  self.write('response-gate-closed-live.json',{'closed':True,'nonterminalCanonical':0,'checkedEpoch':time.time()})
 def write(self,name,value):(self.root/name).write_text(json.dumps(value))
 def test_closed_drained_fresh_allowed(self):self.ns['fenced']()
 def test_open_active_stale_future_refused(self):
  for change in [{'closed':False},{'nonterminalCanonical':1},{'checkedEpoch':time.time()-1201},{'checkedEpoch':time.time()+60}]:
   with self.subTest(change=change):
    self.write('response-gate-closed-live.json',dict({'closed':True,'nonterminalCanonical':0,'checkedEpoch':time.time()},**change))
    with self.assertRaises(AssertionError):self.ns['fenced']()
 def test_expired_window_blocks_forward_but_allows_fenced_recovery(self):
  self.write('response-maintenance-window.json',{'deadlineUtc':(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=1)).isoformat()})
  with self.assertRaises(AssertionError):self.ns['fenced']()
  self.ns['MODE']='recover-job';self.ns['fenced']()
  self.write('response-gate-closed-live.json',{'closed':False,'nonterminalCanonical':0,'checkedEpoch':time.time()})
  with self.assertRaises(AssertionError):self.ns['fenced']()
 def test_mixed_traffic_refused(self):
  self.ns['live']({'traffic':[{'revision':'old','percent':100}]},'old')
  for rows in [[{'revision':'new','percent':100}],[{'revision':'old','percent':99},{'revision':'new','percent':1}]]:
   with self.assertRaises(AssertionError):self.ns['live']({'traffic':rows},'old')

if __name__=='__main__':unittest.main()
