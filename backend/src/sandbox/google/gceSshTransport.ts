import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { attachedGceIdentity, GceControlError, type GceApi, type GceExecutionHandle,
  type GceMachineControl } from './gceMachineControl.js';

export type SshFailureCategory = 'PUBLIC_KEY_NOT_ADMITTED' | 'HOST_KEY_REJECTED' | 'PRIVATE_ROUTE_UNAVAILABLE'
  | 'REMOTE_ADMIN_DENIED' | 'REMOTE_CONTROL_UNAVAILABLE' | 'CHANNEL_INTERRUPTED' | 'REMOTE_COMMAND_FAILED';
interface CommandResult { code: number | null; stdout: string; failureCategory?: SshFailureCategory; }
export type NativeCommand = (binary: string, args: readonly string[], input: string, timeoutMs: number) => Promise<CommandResult>;

/** Error text is untrusted diagnostic input, never authority or permission to retry.
 * Return an allowlisted category only. Never retain provider stderr in an error. */
export function classifyNativeSshFailure(stderr: string): SshFailureCategory {
  if (/Permission denied.*publickey|no supported authentication methods/i.test(stderr)) return 'PUBLIC_KEY_NOT_ADMITTED';
  if (/host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(stderr)) return 'HOST_KEY_REJECTED';
  if (/connect to host[^\r\n]*(?:timed out|refused)|No route to host|Network is unreachable/i.test(stderr)) return 'PRIVATE_ROUTE_UNAVAILABLE';
  if (/sudo:[^\r\n]*(?:password|not allowed)|not in the sudoers/i.test(stderr)) return 'REMOTE_ADMIN_DENIED';
  if (/python3:[^\r\n]*(?:can't open file|not found)/i.test(stderr)) return 'REMOTE_CONTROL_UNAVAILABLE';
  if (/Connection (?:closed|reset)|Broken pipe|killed by signal/i.test(stderr)) return 'CHANNEL_INTERRUPTED';
  return 'REMOTE_COMMAND_FAILED';
}

export class GceSshExecutionError extends GceControlError {
  constructor(readonly failureCategory: SshFailureCategory, readonly exitCode: number | null) {
    super('NATIVE_SSH_'+failureCategory);
  }
}

/** Child environment is intentionally independent of process.env. No Google
 * token, platform credential, SSH agent or developer configuration reaches SSH. */
export const nativeSshCommand: NativeCommand = (binary, args, input, timeoutMs) => new Promise((accept, reject) => {
  const child = spawn(binary, [...args], {stdio:['pipe','pipe','pipe'],
    env:{PATH:'/usr/local/bin:/usr/bin:/bin', LANG:'C.UTF-8'}});
  const chunks: Buffer[] = [];
  const diagnostics: Buffer[] = [];
  let bytes = 0;
  let diagnosticBytes = 0;
  let failed = false;
  const deny = () => { if (failed) return; failed=true; child.kill('SIGKILL'); reject(new GceControlError('NATIVE_SSH_TRANSPORT_UNAVAILABLE')); };
  const timer = setTimeout(deny, timeoutMs);
  child.once('error', deny);
  child.stdout.on('data', (value: Buffer) => {bytes+=value.length;if(bytes>1_000_000)deny();else chunks.push(value);});
  // Bound diagnostic input, then discard it after classifying a nonzero exit.
  // Raw stderr can contain source or credentials and never leaves this function.
  child.stderr.on('data', (value: Buffer) => {
    const remaining=16384-diagnosticBytes;
    if(remaining>0){const captured=value.subarray(0,remaining);diagnostics.push(captured);diagnosticBytes+=captured.length;}
  });
  child.stdin.once('error', deny);
  child.once('close', code => {
    clearTimeout(timer);
    if(!failed)accept(code===0 ? {code,stdout:Buffer.concat(chunks).toString('utf8')} :
      {code,stdout:'',failureCategory:classifyNativeSshFailure(Buffer.concat(diagnostics).toString('utf8'))});
  });
  child.stdin.end(input);
});

export interface EphemeralSshKey {
  directory: string;
  privatePath: string;
  publicKey: string;
  cleanup(): Promise<void>;
}

export async function temporaryNativeSshKey(command: NativeCommand = nativeSshCommand): Promise<EphemeralSshKey> {
  const prefix = resolve(tmpdir(), 'xroga-native-ssh-');
  const directory = await mkdtemp(join(tmpdir(),'xroga-native-ssh-'));
  await chmod(directory,0o700);
  const privatePath = join(directory,'identity');
  const cleanup = async () => {
    // Verify the absolute deletion target before recursive cleanup on Windows too.
    if (!resolve(directory).startsWith(prefix)) throw new GceControlError('INVALID_NATIVE_SSH_CLEANUP_TARGET');
    await rm(directory,{recursive:true,force:true});
  };
  try {
    const created = await command('ssh-keygen',['-q','-t','ed25519','-N','','-C','xroga-native-controller','-f',privatePath],'',10000);
    if(created.code!==0)throw new GceControlError('NATIVE_SSH_KEY_CREATION_FAILED');
    await chmod(privatePath,0o600);
    const publicKey = (await readFile(privatePath+'.pub','utf8')).trim();
    if(!/^ssh-ed25519 [A-Za-z0-9+/]{60,100}={0,2}(?: [^\r\n]*)?$/.test(publicKey))throw new GceControlError('INVALID_NATIVE_SSH_PUBLIC_KEY');
    return {directory,privatePath,publicKey,cleanup};
  } catch(error) {await cleanup();throw error;}
}

type LoginProfile = {posixAccounts?: {primary?: boolean;username?: string;operatingSystemType?: string}[];
  sshPublicKeys?: Record<string,{key?: string;expirationTimeUsec?: string}>};
const workerDenials = new Set(['RUNTIME_BINDING_MISMATCH','RUNTIME_EXPIRED','INVALID_REQUEST','UNKNOWN_OPERATION',
  'INVALID_COMMAND','INVALID_ENVIRONMENT','UNKNOWN_NETWORK_POLICY','IMAGE_NOT_ADMITTED','INVALID_EXECUTION_TIMEOUT',
  'INVALID_PROCESS_PORT','PORT_REQUIRES_PREVIEW_NETWORK','UNKNOWN_RESTART_POLICY','INVALID_PROCESS_REFERENCE',
  'DOCKER_CONTROL_FAILED','INVALID_BOUND_RESOURCE_LIMITS','PROCESS_NOT_OWNED_OR_RUNNING','NETWORK_GUARD_UNAVAILABLE',
  'PROCESS_START_FAILED','PROCESS_LOGS_FAILED','REQUEST_TOO_LARGE','EXECUTION_CONTROL_UNAVAILABLE']);

export class GceSshTransport {
  constructor(private readonly control: Pick<GceMachineControl,'resolve'|'configuration'>,
    private readonly api: GceApi = attachedGceIdentity(),
    private readonly command: NativeCommand = nativeSshCommand,
    private readonly keyFactory: () => Promise<EphemeralSshKey> = temporaryNativeSshKey) {}

  async run<T>(handle: GceExecutionHandle, operation: Readonly<Record<string, unknown>>, timeoutMs: number): Promise<T> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) throw new GceControlError('INVALID_NATIVE_SSH_TIMEOUT');
    const payload = JSON.stringify({...operation,binding:{runtimeId:handle.runtimeId,
      ownerBinding:handle.ownerBinding,projectBinding:handle.projectBinding}});
    if(Buffer.byteLength(payload)>4*1024*1024)throw new GceControlError('NATIVE_SSH_REQUEST_TOO_LARGE');
    // This rechecks current VM ownership, instance identity, image and expiry.
    // A denial never becomes another identity, a new VM or another transport.
    const target = await this.control.resolve(handle);
    const key = await this.keyFactory();
    const account = this.control.configuration.serviceAccount;
    const user = `https://oslogin.googleapis.com/v1/users/${encodeURIComponent(account)}`;
    let fingerprint: string | undefined;
    let revoked = false;
    try {
      const expirationTimeUsec = String((Date.now()+300000)*1000);
      let profile: LoginProfile;
      try {
        profile = (await this.api.request<{loginProfile?: LoginProfile}>({url:user+':importSshPublicKey?projectId='+this.control.configuration.project,
          method:'POST',data:{key:key.publicKey,expirationTimeUsec},retry:false,timeout:15000})).data.loginProfile ?? {};
      } catch {throw new GceControlError('NATIVE_OS_LOGIN_ADMISSION_DENIED');}
      const parts = (value: string) => value.trim().split(/\s+/).slice(0,2).join(' ');
      const matches = Object.entries(profile.sshPublicKeys ?? {}).filter(([,value]) => value.key && parts(value.key)===parts(key.publicKey));
      if(matches.length!==1 || !/^[A-Za-z0-9_-]{16,128}$/.test(matches[0][0]))throw new GceControlError('NATIVE_OS_LOGIN_KEY_RECEIPT_INVALID');
      fingerprint=matches[0][0];
      const expiry=matches[0][1].expirationTimeUsec;
      if(!expiry || !/^[0-9]{1,20}$/.test(expiry) || BigInt(expiry)>BigInt(expirationTimeUsec)
        || BigInt(expiry)<=BigInt(Date.now())*1000n)throw new GceControlError('NATIVE_OS_LOGIN_KEY_EXPIRY_INVALID');
      const valid = (profile.posixAccounts ?? []).filter(value => value.operatingSystemType!=='WINDOWS'
        && typeof value.username==='string' && /^sa_[a-z0-9_]{3,62}$/.test(value.username));
      const primary = valid.filter(value => value.primary===true);
      const accounts = primary.length ? primary : valid;
      if(accounts.length!==1)throw new GceControlError('NATIVE_OS_LOGIN_PRINCIPAL_AMBIGUOUS');
      // Trust a host key retrieved through the authenticated Compute API only.
      // No accept-new, disabled checking, ssh-keyscan or developer known_hosts.
      const alias = 'xroga-'+handle.instanceId;
      const known = join(key.directory,'known_hosts');
      await writeFile(known,alias+' '+target.sshHostKey+'\n',{mode:0o600});
      const result = await this.command('ssh',['-T','-F','/dev/null','-i',key.privatePath,
        '-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
        '-o','UserKnownHostsFile='+known,'-o','GlobalKnownHostsFile=/dev/null','-o','HostKeyAlias='+alias,
        '-o','ForwardAgent=no','-o','ClearAllForwardings=yes','-o','PasswordAuthentication=no',
        '-o','KbdInteractiveAuthentication=no','-o','GSSAPIAuthentication=no','-o','ProxyCommand=none',
        '-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=2',
        '--',accounts[0].username+'@'+target.privateIp,'sudo','-n','python3','/opt/xroga/runtime_control.py'],payload,timeoutMs+30000);
      if(result.code!==0)throw new GceSshExecutionError(result.failureCategory ?? 'REMOTE_COMMAND_FAILED',result.code);
      let reply: {ok?: unknown;result?: T;code?: unknown};
      try {reply=JSON.parse(result.stdout);} catch {throw new GceControlError('INVALID_NATIVE_EXECUTION_RECEIPT');}
      if(reply.ok!==true || !Object.hasOwn(reply,'result'))throw new GceControlError(
        typeof reply.code==='string' && workerDenials.has(reply.code) ? 'NATIVE_EXECUTION_'+reply.code : 'NATIVE_EXECUTION_REFUSED');
      return reply.result as T;
    } finally {
      try {
        if(fingerprint) {
          try {
            await this.api.request({url:user+'/sshPublicKeys/'+encodeURIComponent(fingerprint),method:'DELETE',retry:false,timeout:15000});
            revoked=true;
          } catch(error) {
            // An authoritative not-found receipt is already-revoked admission.
            revoked=(error as {response?: {status?: number}})?.response?.status===404;
          }
        }
      } finally {await key.cleanup();}
      if(fingerprint && !revoked)throw new GceControlError('NATIVE_SSH_KEY_REVOCATION_PENDING');
    }
  }
}
