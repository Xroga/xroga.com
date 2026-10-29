import { Compute } from 'google-auth-library';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface GceExecutionConfiguration {
  project: string;
  zone: string;
  subnet: string;
  imageName: string;
  imageId: string;
  serviceAccount: string;
  admittedImages: readonly string[];
  maxConcurrentInstances?: number;
}

export interface GceExecutionHandle {
  name: string;
  instanceId: string;
  runtimeId: string;
  ownerBinding: string;
  projectBinding: string;
  expiresAtEpoch: number;
  /** Native insert operation, retained so pending creation cannot be mistaken
   * for successful cleanup when its instance is not visible yet. */
  creationOperationName?: string;
}

export interface GceApi {
  request<T>(options: {url: string; method: 'GET' | 'POST' | 'DELETE'; data?: unknown; retry?: boolean; timeout?: number}): Promise<{data: T}>;
}

export class GceControlError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'GceControlError'; }
}

export class GceAllocationCleanupPendingError extends GceControlError {
  constructor(readonly allocation:GceExecutionHandle){super('GCE_ALLOCATION_CLEANUP_PENDING');}
}

const fail = (code: string): never => { throw new GceControlError(code); };
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const hash = (value: string): string => digest(value).slice(0, 40);
const id = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
const imageDigest = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;

export function validateGceConfiguration(configuration: GceExecutionConfiguration): void {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(configuration.project)
    || !/^[a-z]+-[a-z]+[0-9]-[a-z]$/.test(configuration.zone)
    || !configuration.subnet.startsWith(`projects/${configuration.project}/regions/`)
    || !/^projects\/[a-z0-9-]+\/regions\/[a-z0-9-]+\/subnetworks\/[a-z0-9-]+$/.test(configuration.subnet)
    || !/^xroga-exec-[a-z0-9-]+$/.test(configuration.imageName) || !id(configuration.imageId)
    || !new RegExp(`^[a-z][a-z0-9-]{5,29}@${configuration.project}\\.iam\\.gserviceaccount\\.com$`).test(configuration.serviceAccount)
    || !configuration.admittedImages.length || configuration.admittedImages.some(image => !imageDigest.test(image))
    || (configuration.maxConcurrentInstances!==undefined && ![1,2].includes(configuration.maxConcurrentInstances))) fail('INVALID_GCE_EXECUTION_CONFIGURATION');
}

/** Native attached identity only. No developer profile or downloaded key. */
export function attachedGceIdentity(env: Readonly<NodeJS.ProcessEnv> = process.env): Compute {
  const forbidden = ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CREDENTIALS', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'GCE_METADATA_HOST', 'GCE_METADATA_IP', 'FLY_APP_NAME', 'FLY_MACHINE_ID'];
  if (forbidden.some(name => Boolean(env[name]))
    || Object.keys(env).some(name => /^XROGA_.*(?:FLY|WIF)/.test(name) && env[name])
    || (env.XROGA_GOOGLE_CLOUD_AUTH_MODE && env.XROGA_GOOGLE_CLOUD_AUTH_MODE !== 'metadata_adc')) fail('NATIVE_GCE_IDENTITY_REQUIRED');
  return new Compute({scopes:['https://www.googleapis.com/auth/cloud-platform']});
}

export interface CreateGceExecution {
  // Physical resource ownership and isolation labels, never a product authority
  // issuer. Canonical request/run/project authorization remains above this seam.
  runtimeId: string;
  ownerReference: string;
  scopeReference: string;
  ttlSeconds: number;
  memoryMb: number;
  diskMb: number;
  maxProcesses: number;
  cpus: number;
}

export function executionBinding(input: CreateGceExecution) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.runtimeId)
    || typeof input.ownerReference !== 'string' || !input.ownerReference.trim() || input.ownerReference.length > 128
    || typeof input.scopeReference !== 'string' || !input.scopeReference.trim() || input.scopeReference.length > 128
    || !Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 7200
    || !Number.isInteger(input.memoryMb) || input.memoryMb < 128 || input.memoryMb > 4096
    || !Number.isInteger(input.diskMb) || input.diskMb < 64 || input.diskMb > 4096
    || !Number.isInteger(input.maxProcesses) || input.maxProcesses < 16 || input.maxProcesses > 512
    || ![1, 2].includes(input.cpus)) fail('INVALID_GCE_EXECUTION_BOUNDS');
  return {runtimeId:input.runtimeId, ownerBinding:hash(input.ownerReference), projectBinding:hash(input.scopeReference)};
}

/** First-party bootstrap only. No customer source or credentials in metadata. */
export function gceBootstrap(binding: Record<string, unknown>, workerSource: string): string {
  if (!Number.isInteger(binding.diskMb) || Number(binding.diskMb) < 64 || Number(binding.diskMb) > 4096
    || !workerSource || Buffer.byteLength(workerSource) > 128_000) fail('INVALID_GCE_BOOTSTRAP');
  const configuration = Buffer.from(JSON.stringify(binding)).toString('base64');
  const worker = Buffer.from(workerSource).toString('base64');
  return `#!/bin/bash
set -Eeuo pipefail
test "$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' -H 'Metadata-Flavor: Google' http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token)" = 404
mkdir -p /opt/xroga/work
chmod 755 /opt/xroga
printf '%s' '${configuration}' | base64 -d > /opt/xroga/runtime-binding.json
private_ip=$(curl --fail --silent --max-time 5 -H 'Metadata-Flavor: Google' http://169.254.169.254/computeMetadata/v1/instance/network-interfaces/0/ip)
python3 - "$private_ip" <<'XROGA_BINDING'
import json,pathlib,sys,re
p=pathlib.Path('/opt/xroga/runtime-binding.json');data=json.loads(p.read_text())
assert re.fullmatch(r'10\\.90\\.0\\.[0-9]{1,3}',sys.argv[1])
data['privateIp']=sys.argv[1];p.write_text(json.dumps(data))
XROGA_BINDING
printf '%s' '${worker}' | base64 -d > /opt/xroga/runtime_control.py
chmod 600 /opt/xroga/runtime-binding.json
chmod 755 /opt/xroga/runtime_control.py
if ! test -f /opt/xroga/workspace.img; then
  truncate -s '${String(binding.diskMb)}M' /opt/xroga/workspace.img
  mkfs.ext4 -Fq /opt/xroga/workspace.img
fi
mountpoint -q /opt/xroga/work || mount -o loop,nodev,nosuid /opt/xroga/workspace.img /opt/xroga/work
chown 65532:65532 /opt/xroga/work
chmod 700 /opt/xroga/work
systemctl start docker
iptables -N XROGA_EXEC_EGRESS 2>/dev/null || true
iptables -F XROGA_EXEC_EGRESS
iptables -A XROGA_EXEC_EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A XROGA_EXEC_EGRESS -d 169.254.169.254/32 -p udp --dport 53 -j RETURN
iptables -A XROGA_EXEC_EGRESS -d 169.254.169.254/32 -p tcp --dport 53 -j RETURN
for cidr in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16; do
  iptables -A XROGA_EXEC_EGRESS -d "$cidr" -j DROP
done
iptables -A XROGA_EXEC_EGRESS -j RETURN
iptables -C DOCKER-USER -i docker0 -j XROGA_EXEC_EGRESS 2>/dev/null || iptables -I DOCKER-USER 1 -i docker0 -j XROGA_EXEC_EGRESS
iptables -C INPUT -i docker0 -j DROP 2>/dev/null || iptables -I INPUT 1 -i docker0 -j DROP
# A cloned base image must not clone a worker's SSH host identity.
rm -f /etc/ssh/ssh_host_ed25519_key /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_rsa_key /etc/ssh/ssh_host_rsa_key.pub /etc/ssh/ssh_host_ecdsa_key /etc/ssh/ssh_host_ecdsa_key.pub
ssh-keygen -A
systemctl restart ssh.service
curl --fail --silent --show-error --max-time 10 -X PUT -H 'Metadata-Flavor: Google' --data-binary @/etc/ssh/ssh_host_ed25519_key.pub http://169.254.169.254/computeMetadata/v1/instance/guest-attributes/hostkeys/ssh-ed25519
echo XROGA_GCE_RUNTIME_BOOTSTRAP_READY
`;
}

type Instance = {id?: string; name?: string; status?: string; labels?: Record<string,string>;
  serviceAccounts?: unknown[]; networkInterfaces?: {networkIP?: string; subnetwork?: string}[];
  metadata?: {items?: {key: string; value: string}[]}};

/** Infrastructure adapter below the existing scheduler and owner-bound stores. */
export class GceMachineControl {
  private static allocationTail: Promise<void> = Promise.resolve();
  readonly configuration: Readonly<GceExecutionConfiguration>;
  private readonly api: GceApi;
  constructor(configuration: GceExecutionConfiguration, api?: GceApi,
    private readonly workerSource = readFileSync(new URL('../../../src/sandbox/google/runtime_control.py', import.meta.url), 'utf8'),
    private readonly wait: (milliseconds:number)=>Promise<void> = milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))) {
    validateGceConfiguration(configuration);
    this.configuration = Object.freeze({...configuration, admittedImages:Object.freeze([...configuration.admittedImages])});
    this.api = api ?? attachedGceIdentity();
  }
  private get prefix() { return `https://compute.googleapis.com/compute/v1/projects/${this.configuration.project}`; }
  private async call<T>(method: 'GET'|'POST'|'DELETE', path: string, data?: unknown): Promise<T> {
    try { return (await this.api.request<T>({url:this.prefix+path, method, data, retry:false, timeout:30000})).data; }
    catch (error) {
      const status = (error as {response?: {status?: number}})?.response?.status;
      return fail(status === 409 ? 'GCE_EXECUTION_CAPACITY_RESERVED' : status === 404 ? 'GCE_CONTROL_NOT_FOUND' : status === 401 || status === 403
        ? 'GCE_CONTROL_PERMISSION_DENIED' : 'GCE_CONTROL_REQUEST_UNAVAILABLE');
    }
  }
  private path(name: string) {
    if (!/^xroga-exec-(?:[a-f0-9]{32}|slot-[12])$/.test(name)) fail('INVALID_GCE_EXECUTION_REFERENCE');
    return `/zones/${this.configuration.zone}/instances/${name}`;
  }
  async probe(): Promise<void> {
    const image=await this.call<{id?:string;status?:string}>('GET',`/global/images/${this.configuration.imageName}`);
    if(image.id!==this.configuration.imageId || image.status!=='READY')fail('GCE_BASE_IMAGE_IDENTITY_MISMATCH');
    await this.call('GET',`/zones/${this.configuration.zone}/instances?maxResults=1&fields=items(name)`);
  }
  async create(input: CreateGceExecution,onAllocated?:(handle:GceExecutionHandle)=>Promise<void>): Promise<GceExecutionHandle> {
    executionBinding(input);
    const previous=GceMachineControl.allocationTail;
    let release!: () => void;
    GceMachineControl.allocationTail=new Promise<void>(resolve=>{release=resolve;});
    await previous;
    let allocated:GceExecutionHandle|undefined;
    try {return await this.createBounded(input,async handle=>{
      allocated=structuredClone(handle);await onAllocated?.(structuredClone(handle));
    });}catch(error){
      if(allocated){try{await this.destroy(allocated);}catch{throw new GceAllocationCleanupPendingError(allocated);}}
      if(error instanceof GceControlError)throw error;
      return fail('GCE_ALLOCATION_ADMISSION_FAILED');
    }finally {release();}
  }
  private async createBounded(input: CreateGceExecution,onAllocated:(handle:GceExecutionHandle)=>Promise<void>): Promise<GceExecutionHandle> {
    const scope = executionBinding(input);
    const image = await this.call<{id?: string; status?: string}>('GET', `/global/images/${this.configuration.imageName}`);
    if (image.id !== this.configuration.imageId || image.status !== 'READY') fail('GCE_BASE_IMAGE_IDENTITY_MISMATCH');
    // Inventory reconciles existing allocations, including legacy names. The
    // fixed slot names below enforce the physical bound across processes:
    // Compute rejects duplicate names, even after a stale inventory response.
    let page: string | undefined;
    let observed=0;
    const occupied=new Set<string>();
    for(let index=0; index<20; index++) {
      const list=await this.call<{items?: {name?: string}[];nextPageToken?: string}>('GET',
        `/zones/${this.configuration.zone}/instances?maxResults=500&fields=items(name),nextPageToken${page?'&pageToken='+encodeURIComponent(page):''}`);
      observed+=(list.items ?? []).filter(instance=>instance.name?.startsWith('xroga-exec-')).length;
      for(const instance of list.items??[])if(instance.name)occupied.add(instance.name);
      if(observed>=(this.configuration.maxConcurrentInstances ?? 2))fail('GCE_EXECUTION_CAPACITY_RESERVED');
      page=list.nextPageToken;
      if(!page)break;
      if(index===19)fail('GCE_FLEET_INVENTORY_INCOMPLETE');
    }
    const name = ['xroga-exec-slot-1','xroga-exec-slot-2'].slice(0,this.configuration.maxConcurrentInstances??2)
      .find(candidate=>!occupied.has(candidate));
    if(!name)return fail('GCE_EXECUTION_CAPACITY_RESERVED');
    const expiresAtEpoch = Math.floor(Date.now()/1000) + input.ttlSeconds;
    const binding = {...scope, expiresAtEpoch, memoryMb:input.memoryMb, diskMb:input.diskMb,
      cpus:input.cpus, maxProcesses:input.maxProcesses, allowedImages:this.configuration.admittedImages,
      privateIp:null};
    const source = gceBootstrap(binding, this.workerSource);
    if (Buffer.byteLength(source) > 240_000) fail('GCE_BOOTSTRAP_TOO_LARGE');
    type CreationOperation = {name?:string;status?:string;error?:unknown;targetId?:string;targetLink?:string};
    const operation = await this.call<CreationOperation>('POST', `/zones/${this.configuration.zone}/instances?requestId=${randomUUID()}`, {
      name, machineType:`zones/${this.configuration.zone}/machineTypes/${input.memoryMb <= 2048 ? 'e2-medium' : 'e2-standard-2'}`,
      labels:{'xroga-runtime':scope.runtimeId, 'xroga-owner':scope.ownerBinding, 'xroga-project':scope.projectBinding},
      tags:{items:['xroga-exec']}, serviceAccounts:[],
      disks:[{boot:true, autoDelete:true, initializeParams:{diskSizeGb:'20', diskType:`zones/${this.configuration.zone}/diskTypes/pd-standard`,
        sourceImage:`projects/${this.configuration.project}/global/images/${this.configuration.imageName}`}}],
      networkInterfaces:[{subnetwork:this.configuration.subnet, accessConfigs:[{name:'External NAT',type:'ONE_TO_ONE_NAT'}]}],
      scheduling:{automaticRestart:false, onHostMaintenance:'MIGRATE', instanceTerminationAction:'DELETE', maxRunDuration:{seconds:String(input.ttlSeconds)}},
      metadata:{items:[{key:'enable-oslogin',value:'TRUE'},{key:'block-project-ssh-keys',value:'TRUE'},
        {key:'enable-guest-attributes',value:'TRUE'},{key:'xroga-expires-at',value:String(expiresAtEpoch)},
        {key:'xroga-control-sha256',value:digest(this.workerSource)},{key:'startup-script',value:source}]},
    });
    if (!operation.name || !/^[a-zA-Z0-9_-]+$/.test(operation.name)) fail('INVALID_GCE_CREATION_RECEIPT');
    let allocated:GceExecutionHandle|undefined;
    const captureAllocation=async (receipt:CreationOperation)=>{
      if(receipt.targetLink && !receipt.targetLink.endsWith(`/projects/${this.configuration.project}/zones/${this.configuration.zone}/instances/${name}`))
        fail('GCE_CREATION_OPERATION_IDENTITY_MISMATCH');
      if(receipt.targetId===undefined)return;
      if(!id(receipt.targetId) || (allocated && allocated.instanceId!==receipt.targetId))fail('GCE_CREATION_OPERATION_IDENTITY_MISMATCH');
      if(allocated)return;
      allocated={name,instanceId:receipt.targetId,...scope,expiresAtEpoch,creationOperationName:operation.name};
      await onAllocated(structuredClone(allocated));
    };
    // Compute has taken over 100s on a real cold allocation. Record its native
    // target as soon as available and allow a bounded three-minute poll budget.
    // One POST still owns the physical slot. No timeout provisions a replacement.
    await captureAllocation(operation);
    const creationDeadline=Date.now()+180000;
    for (let attempt=0; attempt<360 && Date.now()<creationDeadline; attempt++) {
      const status = await this.call<CreationOperation>('GET', `/zones/${this.configuration.zone}/operations/${operation.name}`);
      await captureAllocation(status);
      if (status.error) fail('GCE_CREATION_OPERATION_FAILED');
      if (status.status === 'DONE') {
        const machine = await this.call<Instance>('GET', this.path(name));
        if (!id(machine.id)) return fail('INVALID_GCE_INSTANCE_IDENTITY');
        await captureAllocation({targetId:machine.id});
        const handle=allocated!;
        for (let boot=0; boot<180; boot++) {
          try { await this.resolve(handle); return handle; }
          catch (error) {
            if (!(error instanceof GceControlError) || !['GCE_SSH_HOST_IDENTITY_NOT_READY',
              'GCE_CONTROL_NOT_FOUND', 'GCE_RUNTIME_BOOTING'].includes(error.code)) throw error;
          }
          await this.wait(500);
        }
        return fail('GCE_BOOTSTRAP_TIMED_OUT_NO_REPROVISION');
      }
      await this.wait(500);
    }
    return fail('GCE_CREATION_TIMED_OUT_NO_REPROVISION');
  }
  /**
   * Every Xroga execution machine in the zone, with the identity its labels and metadata claim. A machine whose identity cannot be read completely has
   * a null handle: it is reported but can never be destroyed from here. The inventory must be complete; a listing that cannot be finished is an
   * error, never a partial answer an orphan sweep could act on.
   */
  async listAllocations(): Promise<Array<{name: string; handle: GceExecutionHandle | null; createdAtEpoch: number | null; status: string}>> {
    const found: Array<{name: string; handle: GceExecutionHandle | null; createdAtEpoch: number | null; status: string}> = [];
    let page: string | undefined;
    for (let index = 0; ; index++) {
      if (index === 20) fail('GCE_FLEET_INVENTORY_INCOMPLETE');
      const list = await this.call<{items?: (Instance & {creationTimestamp?: string})[]; nextPageToken?: string}>('GET',
        `/zones/${this.configuration.zone}/instances?maxResults=500&fields=items(id,name,status,labels,creationTimestamp,metadata/items),nextPageToken${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
      for (const machine of list.items ?? []) {
        if (!machine.name?.startsWith('xroga-exec-')) continue;
        const labels = machine.labels ?? {};
        const metadata = Object.fromEntries((machine.metadata?.items ?? []).map(item => [item.key, item.value]));
        const expires = Number(metadata['xroga-expires-at']);
        const created = machine.creationTimestamp ? Math.floor(Date.parse(machine.creationTimestamp) / 1000) : NaN;
        const complete = id(machine.id) && /^xroga-exec-(?:[a-f0-9]{32}|slot-[12])$/.test(machine.name)
          && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(labels['xroga-runtime'] ?? '')
          && /^[a-f0-9]{40}$/.test(labels['xroga-owner'] ?? '') && /^[a-f0-9]{40}$/.test(labels['xroga-project'] ?? '') && Number.isInteger(expires);
        found.push({
          name: machine.name, status: machine.status ?? 'UNKNOWN', createdAtEpoch: Number.isFinite(created) ? created : null,
          handle: complete ? {name: machine.name, instanceId: machine.id!, runtimeId: labels['xroga-runtime']!, ownerBinding: labels['xroga-owner']!,
            projectBinding: labels['xroga-project']!, expiresAtEpoch: expires} : null,
        });
      }
      page = list.nextPageToken;
      if (!page) break;
    }
    return found;
  }
  private validateReference(handle:GceExecutionHandle,cleanup:boolean):void {
    this.path(handle.name);
    if (!id(handle.instanceId) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(handle.runtimeId)
      || !/^[a-f0-9]{40}$/.test(handle.ownerBinding) || !/^[a-f0-9]{40}$/.test(handle.projectBinding)
      || (handle.name !== 'xroga-exec-'+handle.runtimeId.replaceAll('-','') && !/^xroga-exec-slot-[12]$/.test(handle.name))
      || !Number.isInteger(handle.expiresAtEpoch) || (!cleanup && handle.expiresAtEpoch <= Date.now()/1000)) fail('GCE_RUNTIME_EXPIRED_OR_INVALID');
  }
  private async inspect(handle: GceExecutionHandle, cleanup = false): Promise<{privateIp: string}> {
    this.validateReference(handle,cleanup);
    const machine = await this.call<Instance>('GET', this.path(handle.name));
    const metadata = Object.fromEntries((machine.metadata?.items ?? []).map(item => [item.key,item.value]));
    if (machine.id !== handle.instanceId || machine.name!==handle.name || machine.serviceAccounts?.length
      || machine.labels?.['xroga-runtime'] !== handle.runtimeId || machine.labels?.['xroga-owner'] !== handle.ownerBinding
      || machine.labels?.['xroga-project'] !== handle.projectBinding || metadata['xroga-expires-at'] !== String(handle.expiresAtEpoch)
      || metadata['xroga-control-sha256'] !== digest(this.workerSource)) fail('GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH');
    if (!cleanup && ['PROVISIONING', 'STAGING'].includes(machine.status ?? '')) fail('GCE_RUNTIME_BOOTING');
    if (!cleanup && machine.status !== 'RUNNING') fail('GCE_RUNTIME_NOT_RUNNING');
    const network = machine.networkInterfaces?.[0];
    if (!network?.subnetwork?.endsWith('/'+this.configuration.subnet) && network?.subnetwork !== this.configuration.subnet) fail('GCE_RUNTIME_NETWORK_MISMATCH');
    const privateIp = network?.networkIP;
    if (!privateIp || !/^10\.90\.0\.(?:[1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$/.test(privateIp)) return fail('GCE_RUNTIME_PRIVATE_ADDRESS_MISMATCH');
    const disk = await this.call<{sourceImageId?: string}>('GET', `/zones/${this.configuration.zone}/disks/${handle.name}`);
    if (disk.sourceImageId !== this.configuration.imageId) fail('GCE_BOOT_DISK_IDENTITY_MISMATCH');
    return {privateIp};
  }
  async resolve(handle: GceExecutionHandle): Promise<{privateIp: string; sshHostKey: string}> {
    const {privateIp} = await this.inspect(handle);
    const attributes = await this.call<{queryValue?: {items?: {key: string; namespace: string; value: string}[]}}>('GET',
      this.path(handle.name)+'/getGuestAttributes?queryPath=hostkeys%2Fssh-ed25519');
    const keys = attributes.queryValue?.items?.filter(item => item.key==='ssh-ed25519' && item.namespace==='hostkeys') ?? [];
    if (keys.length!==1 || !/^ssh-ed25519 [A-Za-z0-9+/]{60,100}={0,2}(?: [^\r\n]*)?\s*$/.test(keys[0].value)) fail('GCE_SSH_HOST_IDENTITY_NOT_READY');
    return {privateIp, sshHostKey:keys[0].value.trim().split(/\s+/).slice(0,2).join(' ')};
  }
  async destroy(handle: GceExecutionHandle): Promise<void> {
    this.validateReference(handle,true);
    if(handle.creationOperationName!==undefined){
      if(!/^[a-zA-Z0-9_-]+$/.test(handle.creationOperationName))fail('INVALID_GCE_CREATION_RECEIPT');
      let terminal=false;
      const cleanupDeadline=Date.now()+180000;
      for(let attempt=0;attempt<360 && Date.now()<cleanupDeadline;attempt++){
        const operation=await this.call<{status?:string;targetId?:string;targetLink?:string}>('GET',`/zones/${this.configuration.zone}/operations/${handle.creationOperationName}`);
        if((operation.targetId!==undefined && operation.targetId!==handle.instanceId)
          || (operation.targetLink!==undefined && !operation.targetLink.endsWith(`/projects/${this.configuration.project}/zones/${this.configuration.zone}/instances/${handle.name}`)))
          fail('GCE_CREATION_OPERATION_IDENTITY_MISMATCH');
        if(operation.status==='DONE'){terminal=true;break;}
        await this.wait(500);
      }
      if(!terminal)fail('GCE_CREATION_PENDING_CLEANUP_UNCONFIRMED');
    }
    try { await this.call<Instance>('GET', this.path(handle.name)); }
    catch (error) {
      if (error instanceof GceControlError && error.code === 'GCE_CONTROL_NOT_FOUND') return;
      throw error;
    }
    await this.inspect(handle, true);
    const operation = await this.call<{name?: string}>('DELETE', this.path(handle.name));
    if (!operation.name || !/^[a-zA-Z0-9_-]+$/.test(operation.name)) fail('INVALID_GCE_DELETION_RECEIPT');
    for (let attempt=0; attempt<120; attempt++) {
      const status = await this.call<{status?: string; error?: unknown}>('GET', `/zones/${this.configuration.zone}/operations/${operation.name}`);
      if (status.error) fail('GCE_DELETION_FAILED');
      if (status.status === 'DONE') return;
      await this.wait(500);
    }
    fail('GCE_DELETION_PENDING_NO_FALSE_COMPLETION');
  }
}
