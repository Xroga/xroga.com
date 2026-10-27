"""Real filesystem protocol tests for the Linux worker. No Docker/cloud calls."""
import importlib.util
import os
import pathlib
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runtime_control', pathlib.Path(__file__).with_name('runtime_control.py'))
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='xroga-workspace-test-')
        self.root = pathlib.Path(self.directory.name)
        self.work = self.root / 'work'
        self.work.mkdir(mode=0o700)
        self.binding = {'runtimeId':'synthetic', 'ownerBinding':'owner', 'projectBinding':'project',
                        'expiresAtEpoch':time.time()+60}
        self.mount = patch.object(control, 'WORKSPACE', self.work)
        self.mount.start()

    def tearDown(self):
        self.mount.stop()
        self.directory.cleanup()

    def call(self, operation, **values):
        return control.dispatch({'operation':operation, 'binding':{k:self.binding[k] for k in
                                ['runtimeId','ownerBinding','projectBinding']}, **values}, self.binding)

    def test_write_read_replace_delete_and_absence_are_truthful(self):
        files = [{'path':'src/index.ts','content':'export const value = "π";\n'}]
        self.assertEqual(self.call('write_files',files=files), {'written':['src/index.ts']})
        self.assertEqual(self.call('read_file',path='src/index.ts'), {'content':files[0]['content']})
        self.call('write_files',files=[{'path':'src/index.ts','content':'replacement'}])
        self.assertEqual(self.call('read_file',path='src/index.ts'), {'content':'replacement'})
        self.assertEqual(self.call('read_file',path='not-present.ts'), {'content':None})
        self.assertEqual(self.call('delete_files',paths=['src/index.ts','not-present.ts']), {'deleted':['src/index.ts']})
        self.assertFalse((self.work/'src/index.ts').exists())

    def test_batch_read_and_size_receipts_are_ordered_and_bounded(self):
        self.call('write_files',files=[{'path':'one','content':'π'},{'path':'two','content':'value'}])
        self.assertEqual(self.call('stat_files',paths=['two','missing','one']),
                         {'files':[{'path':'two','size':5},{'path':'missing','size':None},{'path':'one','size':2}]})
        self.assertEqual(self.call('read_files',paths=['two','missing','one']),
                         {'files':[{'path':'two','content':'value'},{'path':'missing','content':None},{'path':'one','content':'π'}]})
        self.call('write_files',files=[{'path':'large-one','content':'a'*1100000}])
        self.call('write_files',files=[{'path':'large-two','content':'a'*1100000}])
        with self.assertRaisesRegex(control.Refused,'WORKSPACE_TRANSFER_LIMIT'):
            self.call('read_files',paths=['large-one','large-two'])

    def test_paths_and_batch_are_validated_before_any_write(self):
        for bad in ['../outside','/etc/passwd','src/../outside','./file','src//file','a\\b','C:/file','a\0b','\udcff','']:
            with self.subTest(path=repr(bad)):
                with self.assertRaisesRegex(control.Refused,'INVALID_WORKSPACE_PATH'):
                    self.call('write_files',files=[{'path':'innocent','content':'never'},{'path':bad,'content':'bad'}])
                self.assertFalse((self.work/'innocent').exists())
        with self.assertRaisesRegex(control.Refused,'INVALID_WORKSPACE_FILES'):
            self.call('write_files',files=[{'path':'a','content':'one'},{'path':'a','content':'two'}])

    def test_writable_by_other_users_workspace_is_refused(self):
        self.work.chmod(0o777)
        with self.assertRaisesRegex(control.Refused,'UNSAFE_WORKSPACE_ENTRY'):
            self.call('write_files',files=[{'path':'denied','content':'never'}])
        self.assertEqual(list(self.work.iterdir()),[])

    def test_foreign_or_expired_binding_cannot_touch_files(self):
        for key in ['runtimeId','ownerBinding','projectBinding']:
            request={'operation':'write_files','files':[{'path':'denied','content':'never'}],
                     'binding':{k:self.binding[k] for k in ['runtimeId','ownerBinding','projectBinding']}}
            request['binding'][key]='foreign'
            with self.assertRaisesRegex(control.Refused,'RUNTIME_BINDING_MISMATCH'):
                control.dispatch(request,self.binding)
        self.binding['expiresAtEpoch']=0
        with self.assertRaisesRegex(control.Refused,'RUNTIME_EXPIRED'):
            self.call('write_files',files=[{'path':'denied','content':'never'}])
        self.assertEqual(list(self.work.iterdir()),[])

    def test_symlink_escapes_and_special_files_are_denied(self):
        outside=self.root/'outside';outside.mkdir();sentinel=outside/'secret';sentinel.write_text('private-canary')
        (self.work/'escape').symlink_to(outside,target_is_directory=True)
        (self.work/'link').symlink_to(sentinel)
        for operation,values in [('read_file',{'path':'escape/secret'}),
                                 ('write_files',{'files':[{'path':'escape/secret','content':'overwritten'}]}),
                                 ('delete_files',{'paths':['escape/secret']}),
                                 ('read_file',{'path':'link'}),
                                 ('write_files',{'files':[{'path':'link','content':'overwritten'}]}),
                                 ('delete_files',{'paths':['link']})]:
            with self.assertRaisesRegex(control.Refused,'UNSAFE_WORKSPACE_ENTRY'):
                self.call(operation,**values)
        os.mkfifo(self.work/'pipe')
        with self.assertRaisesRegex(control.Refused,'UNSAFE_WORKSPACE_ENTRY'):
            self.call('read_file',path='pipe')
        self.assertEqual(sentinel.read_text(),'private-canary')

    def test_atomic_write_failure_preserves_original_and_cleans_temp(self):
        target=self.work/'file';target.write_text('original')
        with patch.object(control.os,'replace',side_effect=OSError('private provider diagnostic')):
            with self.assertRaisesRegex(control.Refused,'WORKSPACE_IO_FAILED'):
                self.call('write_files',files=[{'path':'file','content':'replacement'}])
        self.assertEqual(target.read_text(),'original')
        self.assertEqual([p.name for p in self.work.iterdir()],['file'])

    def test_expiry_before_commit_preserves_original_and_cleans_temp(self):
        target=self.work/'file';target.write_text('original')
        sync=control.os.fsync
        def expire(fd):
            sync(fd)
            self.binding['expiresAtEpoch']=0
        with patch.object(control.os,'fsync',side_effect=expire):
            with self.assertRaisesRegex(control.Refused,'RUNTIME_EXPIRED'):
                self.call('write_files',files=[{'path':'file','content':'replacement'}])
        self.assertEqual(target.read_text(),'original')
        self.assertEqual([p.name for p in self.work.iterdir()],['file'])

    def test_parent_symlink_swap_cannot_redirect_the_open_directory(self):
        (self.work/'src').mkdir()
        outside=self.root/'outside';outside.mkdir();sentinel=outside/'file';sentinel.write_text('private-canary')
        replace=control.os.replace
        def race(*args,**kwargs):
            (self.work/'src').rename(self.work/'moved')
            (self.work/'src').symlink_to(outside,target_is_directory=True)
            return replace(*args,**kwargs)
        with patch.object(control.os,'replace',side_effect=race):
            self.call('write_files',files=[{'path':'src/file','content':'authorized'}])
        self.assertEqual(sentinel.read_text(),'private-canary')
        self.assertEqual((self.work/'moved/file').read_text(),'authorized')

    def test_oversized_nontext_and_directory_reads_are_refused(self):
        with self.assertRaisesRegex(control.Refused,'WORKSPACE_TRANSFER_LIMIT'):
            self.call('write_files',files=[{'path':'large','content':'x'*(2*1024*1024+1)}])
        (self.work/'binary').write_bytes(b'\xff\xfe')
        with self.assertRaisesRegex(control.Refused,'WORKSPACE_NOT_UTF8'):
            self.call('read_file',path='binary')
        (self.work/'folder').mkdir()
        with self.assertRaisesRegex(control.Refused,'UNSAFE_WORKSPACE_ENTRY'):
            self.call('read_file',path='folder')


if __name__=='__main__':unittest.main()
