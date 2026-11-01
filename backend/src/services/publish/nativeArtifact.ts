import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {ProjectFile} from '../integrations/githubDeploy.js';
import {snapshotPublishingSource} from '../../lib/publishingProviderRequest.js';
import {requireTenantContext, type TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import {EgressDenied} from '../../security/egress/egressPolicy.js';
import {storeProjectFile} from '../storage/projectFiles.js';
import {downloadPrivateFile, ownedFile} from '../storage/privateFileDelivery.js';
import {fileFingerprint, MAX_PRIVATE_FILE_BYTES} from '../storage/fileDeliveryPolicy.js';
import {packageBuildZip, chromeExtensionZipFilter, electronPortableZipFilter} from '../scaffolds/packageBuildZip.js';

export type NativeArtifactFlavor = 'chrome' | 'electron';
export interface NativeArtifactReference {
  projectId: string;
  fileId: string;
  fingerprint: string;
  flavor: NativeArtifactFlavor;
  sourceSha256: string;
  zipSha256: string;
  zipSize: number;
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const denied = () => new AuthorityError('NATIVE_ARTIFACT_ADMISSION_DENIED');
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Existing project authority, never an account/repository name supplied as an
 * owner claim. The selected repository remains part of the binding lifetime.
 */
export async function requireNativeArtifactProject(context: TenantContext, repository: string, expected?: string): Promise<string> {
  const actor = requireTenantContext(context);
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) || expected !== undefined && !uuid.test(expected)) throw denied();
  let query = getTenantSupabaseAdmin(actor).from('projects').select('id,user_id,github_repo_name').eq('user_id', actor.userId);
  query = expected ? query.eq('id', expected) : query.ilike('github_repo_name', repository.replace(/[\\%_]/g, '\\$&'));
  const {data, error} = await query.maybeSingle();
  if (error || !data || data.user_id !== actor.userId || typeof data.id !== 'string' || !uuid.test(data.id)
    || expected !== undefined && data.id !== expected || typeof data.github_repo_name !== 'string' || data.github_repo_name.toLowerCase() !== repository.toLowerCase()) throw denied();
  return data.id;
}

/** Inspect source before compression, rather than pretending a ZIP's UTF-8
 * rendering proves there are no credentials or ambiguous extraction paths.
 */
export function inspectNativeArtifactSource(files: ProjectFile[], heldCredentials: readonly string[] = []): ProjectFile[] {
  const snapshot = snapshotPublishingSource(files), paths = new Set<string>();
  if (!snapshot.length) throw denied();
  for (const file of snapshot) {
    const path = file.path, parts = path.split('/');
    if (path.startsWith('/') || /[:\\]/.test(path) || parts.some(part => !part || /[. ]$/.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) throw new EgressDenied('INVALID_EGRESS_INPUT');
    const name = parts.at(-1)!;
    if (parts.some(part => ['.git', '.ssh', '.aws'].includes(part.toLowerCase()))
      || /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|dsa|ed25519)|(?:application_default_)?credentials(?:\.(?:json|ya?ml|toml|ini))?|secrets(?:\.(?:json|ya?ml|toml|ini))?)$/i.test(name)
      && !/^\.env\.(?:example|sample|template)$/i.test(name) || /\.(?:pem|p12|pfx|key)$/i.test(name)) throw new EgressDenied('SECRET_EGRESS_DENIED');
    const key = path.toLowerCase(); if (paths.has(key)) throw new EgressDenied('INVALID_EGRESS_INPUT'); paths.add(key);
  }
  const serialized = JSON.stringify(snapshot);
  for (const value of heldCredentials) {
    if (!value || value.length < 8) continue;
    const bytes = Buffer.from(value);
    if ([value, encodeURIComponent(value), bytes.toString('base64'), bytes.toString('base64url'), JSON.stringify(value).slice(1, -1)].some(form => serialized.includes(form))) throw new EgressDenied('SECRET_EGRESS_DENIED');
  }
  return snapshot;
}

function packageArtifact(files: ProjectFile[], flavor: NativeArtifactFlavor): Buffer {
  if (flavor !== 'chrome' && flavor !== 'electron') throw denied();
  const zip = packageBuildZip(files, {include: flavor === 'chrome' ? chromeExtensionZipFilter : electronPortableZipFilter});
  if (zip.length < 64 || zip.length > MAX_PRIVATE_FILE_BYTES) {zip.fill(0); throw denied();}
  return zip;
}

/** Use existing owner-private project files, not a new artifact store or a
 * large/secret payload hidden inside a business-action plan. The source remains
 * available to its owner even if publication is cancelled or never approved.
 */
export async function storeNativeArtifact(context: TenantContext, repository: string, files: ProjectFile[], flavor: NativeArtifactFlavor, heldCredentials: readonly string[], expectedProject?: string): Promise<NativeArtifactReference> {
  requireTenantContext(context); heldCredentials = [...heldCredentials];
  const snapshot = inspectNativeArtifactSource(files, heldCredentials);
  const projectId = await requireNativeArtifactProject(context, repository, expectedProject);
  const source = JSON.stringify({version: 1, flavor, files: snapshot});
  if (Buffer.byteLength(source) > MAX_PRIVATE_FILE_BYTES) throw denied();
  const zip = packageArtifact(snapshot, flavor);
  const reference = {projectId, flavor, sourceSha256: hash(source), zipSha256: hash(zip), zipSize: zip.length};
  zip.fill(0);
  const saved = await storeProjectFile(context, projectId, `xroga-${flavor}-publication-source.json`, source, 'application/json', 'other');
  await requireNativeArtifactProject(context, repository, projectId);
  const row = await ownedFile(context, projectId, saved.id);
  if (row.delivery_version < 1) throw denied();
  const result = {...reference, fileId: saved.id, fingerprint: fileFingerprint(row)};
  const current = await readNativeArtifact(context, repository, result, heldCredentials);
  current.zip.fill(0);
  return result;
}

/** Re-read actual private bytes and their current ownership/epoch. A request
 * object, public URL or a signed link is never a substitute for that lookup.
 */
export async function readNativeArtifact(context: TenantContext, repository: string, reference: NativeArtifactReference, heldCredentials: readonly string[]) {
  requireTenantContext(context);
  reference = {...reference}; heldCredentials = [...heldCredentials];
  if (!reference || !uuid.test(reference.projectId) || !uuid.test(reference.fileId) || !['chrome', 'electron'].includes(reference.flavor)
    || !/^[a-f0-9]{64}$/.test(reference.fingerprint) || !/^[a-f0-9]{64}$/.test(reference.sourceSha256) || !/^[a-f0-9]{64}$/.test(reference.zipSha256)
    || !Number.isSafeInteger(reference.zipSize) || reference.zipSize < 64 || reference.zipSize > MAX_PRIVATE_FILE_BYTES) throw denied();
  await requireNativeArtifactProject(context, repository, reference.projectId);
  const file = await downloadPrivateFile(context, reference.projectId, reference.fileId);
  try {
    if (file.contentType !== 'application/json' || fileFingerprint(file.row) !== reference.fingerprint || hash(file.buffer) !== reference.sourceSha256) throw denied();
    const payload = JSON.parse(file.buffer.toString('utf8'));
    if (!payload || payload.version !== 1 || payload.flavor !== reference.flavor || !isDeepStrictEqual(Object.keys(payload).sort(), ['files', 'flavor', 'version'])) throw denied();
    const files = inspectNativeArtifactSource(payload.files, heldCredentials), zip = packageArtifact(files, reference.flavor);
    if (zip.length !== reference.zipSize || hash(zip) !== reference.zipSha256) {zip.fill(0); throw denied();}
    try {await requireNativeArtifactProject(context, repository, reference.projectId);} catch (error) {zip.fill(0); throw error;}
    return {zip, files, check: async () => {
      await requireNativeArtifactProject(context, repository, reference.projectId);
      const row = await ownedFile(context, reference.projectId, reference.fileId);
      if (fileFingerprint(row) !== reference.fingerprint) throw denied();
    }};
  } finally {file.buffer.fill(0);}
}
