"""Verify exact Git bytes survive compressed upload preparation without extraction."""
import gzip,hashlib,pathlib,subprocess,tarfile,tempfile,unittest

class SourceArchiveTests(unittest.TestCase):
 def test_exact_source_archive_without_windows_path_walk(self):
  app=pathlib.Path(r'C:/Users/hp/Documents/Codex/2026-10-23/g/work/xroga-response-backend-compatible')
  with tempfile.TemporaryDirectory(prefix='source-archive-test-') as directory:
   raw=pathlib.Path(directory)/'context.tar'
   subprocess.run(['git','archive','--format=tar','--output='+str(raw),
    '3bed89e65411fea9376bce0da8aacd1bd8c72f92','--','Dockerfile.api','.dockerignore','backend'],cwd=app,check=True,timeout=45)
   with tarfile.open(raw) as archive:
    names=archive.getnames()
    self.assertIn('Dockerfile.api',names)
    self.assertIn('backend/src/ai/disabledProviderDispatch.test.ts',names)
    self.assertIn('backend/src/ai/zurelayWire.ts',names)
    self.assertIn('backend/src/ai/answerCoverage.ts',names)
    self.assertFalse(any('.env' in pathlib.PurePosixPath(name).parts or 'node_modules' in pathlib.PurePosixPath(name).parts for name in names))
   packed=pathlib.Path(directory)/'context.tgz'
   with raw.open('rb') as source,gzip.open(packed,'wb') as target:target.write(source.read())
   with gzip.open(packed,'rb') as source:
    self.assertEqual(hashlib.sha256(source.read()).hexdigest(),hashlib.sha256(raw.read_bytes()).hexdigest())

if __name__=='__main__':unittest.main()
