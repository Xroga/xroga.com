"""Credential-free protocol tests. Docker and GCE are not simulated as live proof."""
import importlib.util
import pathlib
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runtime_control', pathlib.Path(__file__).with_name('runtime_control.py'))
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)


class RuntimeControlTests(unittest.TestCase):
    def fixture(self):
        binding = {'runtimeId':'synthetic-runtime', 'ownerBinding':'owner-digest',
                   'projectBinding':'project-digest', 'expiresAtEpoch':time.time()+60,
                   'allowedImages':['node@sha256:'+'a'*64], 'memoryMb':512,
                   'maxProcesses':64, 'cpus':1, 'privateIp':'10.90.0.2'}
        request = {'binding':{key:binding[key] for key in ['runtimeId','ownerBinding','projectBinding']},
                   'operation':'exec', 'image':binding['allowedImages'][0],
                   'networkPolicy':'none', 'command':['node','--version'],
                   'environment':{}, 'timeoutMs':1000}
        return request,binding

    def test_valid_bounded_request(self):
        request,binding=self.fixture()
        self.assertEqual(control.validate(request,binding),'exec')
        args=control.container_arguments(request,binding,'synthetic-container')
        self.assertIn('--read-only',args)
        self.assertIn('--pull=never',args)
        self.assertEqual(args[args.index('--network')+1],'none')
        self.assertEqual(args[args.index('--user')+1],'65532:65532')
        self.assertNotIn('--privileged',args)
        self.assertNotIn('/var/run/docker.sock',' '.join(args))

    def test_foreign_owner_project_runtime_and_expiry_do_not_reach_docker(self):
        for key in ['ownerBinding','projectBinding','runtimeId']:
            request,binding=self.fixture()
            request['binding'][key]='foreign'
            with patch.object(control,'docker') as docker:
                with self.assertRaisesRegex(control.Refused,'RUNTIME_BINDING_MISMATCH'):
                    control.dispatch(request,binding)
                docker.assert_not_called()
        request,binding=self.fixture();binding['expiresAtEpoch']=0
        with self.assertRaisesRegex(control.Refused,'RUNTIME_EXPIRED'):
            control.validate(request,binding)

    def test_unknown_image_timeout_network_and_environment_are_denied(self):
        for key,value in [('image','node:latest'),('timeoutMs',0),('timeoutMs',600001),
                          ('networkPolicy','host'),('command',['node','bad\0argument']),
                          ('environment',{'BAD-NAME':'PRIVATE_CANARY'})]:
            request,binding=self.fixture();request[key]=value
            with patch.object(control,'docker') as docker:
                with self.assertRaises(control.Refused):control.dispatch(request,binding)
                docker.assert_not_called()

    def test_existing_ten_minute_execution_contract_is_preserved(self):
        request,binding=self.fixture();request['timeoutMs']=600000
        self.assertEqual(control.validate(request,binding),'exec')

    def test_missing_network_guard_never_dispatches_a_workload(self):
        request,binding=self.fixture();request['networkPolicy']='registry-only'
        with patch.object(control.subprocess,'run') as run,patch.object(control,'docker') as docker:
            run.return_value.returncode=1
            with self.assertRaisesRegex(control.Refused,'NETWORK_GUARD_UNAVAILABLE'):
                control.dispatch(request,binding)
            docker.assert_not_called()

    def test_bound_resource_escalation_and_unowned_process_are_refused(self):
        request,binding=self.fixture();binding['memoryMb']=32768
        with self.assertRaisesRegex(control.Refused,'INVALID_BOUND_RESOURCE_LIMITS'):
            control.container_arguments(request,binding,'synthetic-container')
        request,binding=self.fixture()
        with patch.object(control,'docker',return_value=b'[{"Config":{"Labels":{}},"State":{"Pid":1,"Running":true}}]'):
            with self.assertRaisesRegex(control.Refused,'PROCESS_NOT_OWNED_OR_RUNNING'):
                control.process_container(1,binding,'docker:xroga-process-'+'a'*32)


if __name__=='__main__':unittest.main()
