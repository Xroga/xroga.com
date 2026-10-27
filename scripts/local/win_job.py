"""Windows-only trusted test-process supervision, not an execution sandbox.
The Job List creation attribute assigns the process atomically before it runs.
Closing the non-inherited job handle kills that process tree, including on crash.
"""
import ctypes as C
from ctypes import wintypes as W
import msvcrt
import os
import subprocess

K=C.WinDLL('kernel32',use_last_error=True)
class BASIC(C.Structure):
 _fields_=[('PerProcessUserTimeLimit',C.c_int64),('PerJobUserTimeLimit',C.c_int64),('LimitFlags',W.DWORD),('MinimumWorkingSetSize',C.c_size_t),('MaximumWorkingSetSize',C.c_size_t),('ActiveProcessLimit',W.DWORD),('Affinity',C.c_size_t),('PriorityClass',W.DWORD),('SchedulingClass',W.DWORD)]
class IO(C.Structure):
 _fields_=[(n,C.c_uint64) for n in ['ReadOperationCount','WriteOperationCount','OtherOperationCount','ReadTransferCount','WriteTransferCount','OtherTransferCount']]
class EXTENDED(C.Structure):
 _fields_=[('BasicLimitInformation',BASIC),('IoInfo',IO),('ProcessMemoryLimit',C.c_size_t),('JobMemoryLimit',C.c_size_t),('PeakProcessMemoryUsed',C.c_size_t),('PeakJobMemoryUsed',C.c_size_t)]
class STARTUP(C.Structure):
 _fields_=[('cb',W.DWORD),('lpReserved',W.LPWSTR),('lpDesktop',W.LPWSTR),('lpTitle',W.LPWSTR),*[(n,W.DWORD) for n in ['dwX','dwY','dwXSize','dwYSize','dwXCountChars','dwYCountChars','dwFillAttribute','dwFlags']],('wShowWindow',W.WORD),('cbReserved2',W.WORD),('lpReserved2',C.c_void_p),('hStdInput',W.HANDLE),('hStdOutput',W.HANDLE),('hStdError',W.HANDLE)]
class STARTUP_EX(C.Structure):
 _fields_=[('StartupInfo',STARTUP),('lpAttributeList',C.c_void_p)]
class PROCESS_INFO(C.Structure):
 _fields_=[('hProcess',W.HANDLE),('hThread',W.HANDLE),('dwProcessId',W.DWORD),('dwThreadId',W.DWORD)]
def api(name,args,result=W.BOOL):
 f=getattr(K,name);f.argtypes=args;f.restype=result;return f
create_job=api('CreateJobObjectW',[C.c_void_p,W.LPCWSTR],W.HANDLE)
set_job=api('SetInformationJobObject',[W.HANDLE,C.c_int,C.c_void_p,W.DWORD])
init_attrs=api('InitializeProcThreadAttributeList',[C.c_void_p,W.DWORD,W.DWORD,C.POINTER(C.c_size_t)])
update_attrs=api('UpdateProcThreadAttribute',[C.c_void_p,W.DWORD,C.c_size_t,C.c_void_p,C.c_size_t,C.c_void_p,C.c_void_p])
delete_attrs=api('DeleteProcThreadAttributeList',[C.c_void_p],None)
create_process=api('CreateProcessW',[W.LPCWSTR,W.LPWSTR,C.c_void_p,C.c_void_p,W.BOOL,W.DWORD,C.c_void_p,W.LPCWSTR,C.POINTER(STARTUP_EX),C.POINTER(PROCESS_INFO)])
close_handle=api('CloseHandle',[W.HANDLE])
wait=api('WaitForSingleObject',[W.HANDLE,W.DWORD],W.DWORD)
exit_code=api('GetExitCodeProcess',[W.HANDLE,C.POINTER(W.DWORD)])

def require(ok,phase):
 if not ok:raise OSError(C.get_last_error(),phase)

class WindowsJob:
 def __init__(self,argv,cwd,environment,memory_bytes=4*1024**3,max_processes=128):
  self.job=None;self.process=None;self.output=None;self.pid=None
  if not argv or not os.path.isabs(argv[0]) or not argv[0].lower().endswith('.exe'):raise ValueError('An absolute trusted executable is required')
  if not 128*1024**2<=memory_bytes<=12*1024**3 or not 1<=max_processes<=256:raise ValueError('Invalid process resource bounds')
  self.job=create_job(None,None);require(self.job,'CREATE_OWNED_JOB_FAILED')
  limits=EXTENDED();limits.BasicLimitInformation.LimitFlags=0x2000|0x200|0x8
  limits.BasicLimitInformation.ActiveProcessLimit=max_processes;limits.JobMemoryLimit=memory_bytes
  read_fd=write_fd=null_fd=None;attributes=None;attributes_initialized=False
  try:
   require(set_job(self.job,9,C.byref(limits),C.sizeof(limits)),'SET_OWNED_JOB_BOUNDS_FAILED')
   read_fd,write_fd=os.pipe();null_fd=os.open(os.devnull,os.O_RDONLY)
   os.set_inheritable(write_fd,True);os.set_inheritable(null_fd,True)
   stdout_handle=msvcrt.get_osfhandle(write_fd);stdin_handle=msvcrt.get_osfhandle(null_fd)
   size=C.c_size_t();init_attrs(None,2,0,C.byref(size));require(size.value>0,'ATTRIBUTE_SIZE_FAILED')
   attributes=C.create_string_buffer(size.value);require(init_attrs(attributes,2,0,C.byref(size)),'ATTRIBUTE_INIT_FAILED');attributes_initialized=True
   jobs=(W.HANDLE*1)(self.job);handles=(W.HANDLE*2)(stdout_handle,stdin_handle)
   require(update_attrs(attributes,0,0x2000D,C.byref(jobs),C.sizeof(jobs),None,None),'ATOMIC_JOB_ATTRIBUTE_FAILED')
   require(update_attrs(attributes,0,0x20002,C.byref(handles),C.sizeof(handles),None,None),'PIPE_INHERITANCE_ATTRIBUTE_FAILED')
   startup=STARTUP_EX();startup.StartupInfo.cb=C.sizeof(startup);startup.StartupInfo.dwFlags=0x100
   startup.StartupInfo.hStdInput=stdin_handle;startup.StartupInfo.hStdOutput=stdout_handle;startup.StartupInfo.hStdError=stdout_handle
   startup.lpAttributeList=C.cast(attributes,C.c_void_p)
   env=C.create_unicode_buffer('\0'.join(k+'='+str(v) for k,v in sorted(environment.items(),key=lambda pair:pair[0].upper()))+'\0\0')
   command=C.create_unicode_buffer(subprocess.list2cmdline(argv));info=PROCESS_INFO()
   require(create_process(argv[0],command,None,None,True,0x80000|0x400|0x08000000,C.cast(env,C.c_void_p),str(cwd),C.byref(startup),C.byref(info)),'ATOMIC_OWNED_PROCESS_START_FAILED')
   self.process=info.hProcess;self.pid=info.dwProcessId;close_handle(info.hThread)
   self.output=os.fdopen(read_fd,'rb',buffering=0);read_fd=None
  except BaseException:
   self.close();raise
  finally:
   if attributes_initialized:delete_attrs(attributes)
   for descriptor in [read_fd,write_fd,null_fd]:
    if descriptor is not None:os.close(descriptor)
 def poll(self):
  if self.process is None:return None
  result=wait(self.process,0)
  if result==0x102:return None
  require(result==0,'PROCESS_WAIT_FAILED');code=W.DWORD();require(exit_code(self.process,C.byref(code)),'PROCESS_EXIT_READ_FAILED');return code.value
 def close(self):
  if self.job:
   require(close_handle(self.job),'CLOSE_OWNED_JOB_FAILED');self.job=None
  if self.process:
   wait(self.process,5000);close_handle(self.process);self.process=None
 def __del__(self):
  try:self.close()
  except Exception:pass
