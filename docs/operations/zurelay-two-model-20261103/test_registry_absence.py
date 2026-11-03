import ast,pathlib,types,unittest

tree=ast.parse(pathlib.Path(__file__).with_name('submit-build.py').read_text())
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='image_absence_verified')
ns={}
exec(compile(ast.Module(body=[fn],type_ignores=[]),'registry-absence-guard','exec'),ns)
check=ns['image_absence_verified']

class RegistryAbsence(unittest.TestCase):
 def test_exact_cli_not_found(self):
  self.assertTrue(check(types.SimpleNamespace(returncode=1,stdout='',stderr='ERROR: (gcloud.artifacts.docker.images.describe) Image not found.\n\nA valid container image can be referenced by tag or digest.')))
 def test_other_outcomes_fail_closed(self):
  for code,out,err in [(0,'{}',''),(1,'','PERMISSION_DENIED'),(1,'','Network unavailable'),(1,'{}','ERROR: (gcloud.artifacts.docker.images.describe) Image not found.'),(2,'','ERROR: (gcloud.artifacts.docker.images.describe) Image not found.'),(1,'','NOT_FOUND: repository not found')]:
   with self.subTest(code=code,out=out,err=err):
    self.assertFalse(check(types.SimpleNamespace(returncode=code,stdout=out,stderr=err)))

if __name__=='__main__':unittest.main()
