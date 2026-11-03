import copy,datetime,importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('probe_job',ROOT/'probe_job.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ProbeGuards(unittest.TestCase):
 def valid(self):return {'approved':True,'singleProbeApproved':True,'sourceSha':module.SHA,'packageId':module.PACKAGE,'maximumProviderMicroUsd':1000,'maximumProviderRequests':1,'maximumOneTimeGoogleUsd':.5,'expiresAtUtc':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=25)).isoformat()}
 def source(self):return {'name':module.CANONICAL,'labels':{'xroga-source-sha':module.RECOVERY_SHA},'template':{'template':{'serviceAccount':module.IDENTITY,'containers':[{'image':module.REPO+module.RECOVERY_DIGEST,'command':['node','dist/scripts/runCanonicalWorker.js'],'env':[{'name':'XROGA_PLATFORM_CONFIG_FILE','value':'/protected/platform.json'}]}],'volumes':[{'name':'protected','secret':{'secret':'existing-config'}}]}}}
 def test_exact_spend_source_and_expiry_required(self):
  module.approval(self.valid())
  for d in [{'approved':False},{'sourceSha':'old'},{'singleProbeApproved':False},{'maximumProviderRequests':2},{'maximumProviderMicroUsd':1001},{'maximumOneTimeGoogleUsd':1},{'expiresAtUtc':'2020-01-01T00:00:00+00:00'}]:
   with self.subTest(d=d),self.assertRaises(AssertionError):module.approval(dict(self.valid(),**d))
 def test_only_single_on_demand_job_and_secret_reference(self):
  original=self.source();saved=copy.deepcopy(original);image=module.REPO+'sha256:'+'a'*64
  result=module.make_job(original,image,self.valid()['expiresAtUtc']);self.assertEqual(original,saved)
  self.assertEqual(result['template']['parallelism'],1);self.assertEqual(result['template']['taskCount'],1)
  task=result['template']['template'];self.assertEqual(task['maxRetries'],0);self.assertEqual(task['timeout'],'120s');self.assertEqual(task['serviceAccount'],module.IDENTITY)
  env={e['name']:e for e in task['containers'][0]['env']};self.assertEqual(env['ZURELAY_API_KEY']['valueSource']['secretKeyRef'],{'secret':'xroga_models_zurelay','version':'1'})
  self.assertNotIn('XROGA_ALLOWED_MODELS',env);self.assertNotIn('XROGA_DISABLED_PROVIDERS',env);self.assertNotIn('value',env['ZURELAY_API_KEY'])
 def test_canonical_drift_literal_secret_and_mutable_image_refused(self):
  owner='11111111-1111-4111-8111-111111111111';image=module.REPO+'sha256:'+'a'*64
  for change in ['source','identity','image','literal']:
   s=self.source()
   if change=='source':s['labels']['xroga-source-sha']='new'
   if change=='identity':s['template']['template']['serviceAccount']='other'
   if change=='image':s['template']['template']['containers'][0]['image']='unverified'
   if change=='literal':s['template']['template']['containers'][0]['env'].append({'name':'API_KEY','value':'synthetic-do-not-copy'})
   with self.subTest(change=change),self.assertRaises(AssertionError):module.make_job(s,image,self.valid()['expiresAtUtc'])
  with self.assertRaises(AssertionError):module.make_job(self.source(),module.REPO+'latest',self.valid()['expiresAtUtc'])
if __name__=='__main__':unittest.main()
