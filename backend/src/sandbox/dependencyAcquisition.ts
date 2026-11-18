/**
 * Controlled dependency acquisition: the trusted-side planning for the restricted-network stage.
 *
 * Before any package is fetched inside the sandbox, this resolves each EXACT pinned version against the registry's own metadata on the trusted side
 * (public https reads only) and produces:
 *  - integrity: every pip requirement carries the sha256 of each published wheel (the sandbox installs with --require-hashes --only-binary, so an
 *    unhashed or source-built package is refused by pip itself); every npm package carries the registry's sha512 integrity, which a verify step
 *    compares with what npm actually installed;
 *  - a licence review: each package's declared licence is classified permissive, review-needed or unknown. Anything not clearly permissive is
 *    listed for a human and the plan is NOT ready until the caller acknowledges it by name;
 *  - the stage commands (install behind the allowlist, then everything else offline) and the files they need.
 * A range, a tag, a missing version or a registry answer that does not carry a digest is a refusal, never a guess. Nothing here installs anything.
 * It does not decide that a package is safe: packages still run as untrusted code inside the sandbox.
 */
import { boundedPublicGet } from '../security/boundedPublicGet.js';

export type Ecosystem = 'pip' | 'npm';
export interface PinnedPackage { readonly name: string; readonly version: string }
export type LicenceClass = 'permissive' | 'review' | 'unknown';
export interface ResolvedPackage extends PinnedPackage { readonly hashes: readonly string[]; readonly licence: string; readonly licenceClass: LicenceClass }
export type RegistryGet = (url: string) => Promise<unknown>;

export class AcquisitionError extends Error {
  constructor(readonly code: 'UNPINNED' | 'NOT_FOUND' | 'NO_DIGEST' | 'REGISTRY_UNAVAILABLE' | 'INVALID', message: string) { super(message); this.name = 'AcquisitionError'; }
}

const PERMISSIVE = /^(?:MIT|MIT-0|ISC|BSD(?:-[0-9]-Clause)?(?:-Clear)?|Apache-2\.0|0BSD|Unlicense|CC0-1\.0|Python-2\.0|PSF-2\.0|BlueOak-1\.0\.0|Zlib|HPND)$/i;
const PERMISSIVE_WORDS = /\b(?:mit|isc|bsd|apache|python software foundation|psf|unlicense|public domain|zlib)/i;
const COPYLEFT = /\b(?:gpl|agpl|lgpl|sspl|busl|commons clause|proprietary|non-?commercial)\b/i;

/** Classifies a declared licence string or SPDX expression. Anything not clearly permissive needs a human; an empty one is unknown. */
export function classifyLicence(declared: string): LicenceClass {
  const text = declared.trim();
  if (!text || /^(?:unknown|none|see license)/i.test(text) || /see license in/i.test(text)) return text ? 'review' : 'unknown';
  if (COPYLEFT.test(text)) return 'review';
  const parts = text.replace(/[()]/g, ' ').split(/\s+(?:OR|AND|WITH)\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length && parts.every((p) => PERMISSIVE.test(p))) return 'permissive';
  if (text.length <= 200 && PERMISSIVE_WORDS.test(text) && !/\b(?:but|except|provided|shall|hereby|permission)\b/i.test(text)) return 'permissive';
  return 'review';
}

const EXACT_PIP = /^\d+(?:\.\d+){1,3}(?:(?:a|b|rc)\d+)?(?:\.post\d+)?$/;
const EXACT_NPM = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PIP_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]{0,60}\/)?[a-z0-9][a-z0-9._-]{0,100}$/;

export const publicRegistryGet: RegistryGet = async (url) => {
  const response = await boundedPublicGet(url, { maxBytes: 4 * 1024 * 1024, timeoutMs: 20_000, maxRedirects: 2, allowHttpErrors: true });
  if (response.statusCode === 404) throw new AcquisitionError('NOT_FOUND', 'The registry does not list that exact version.');
  if (response.statusCode !== 200) throw new AcquisitionError('REGISTRY_UNAVAILABLE', `The registry answered ${response.statusCode}.`);
  try { return JSON.parse(response.bytes.toString('utf8')); } catch { throw new AcquisitionError('REGISTRY_UNAVAILABLE', 'The registry reply was not readable.'); }
};

export async function resolvePip(pkg: PinnedPackage, get: RegistryGet): Promise<ResolvedPackage> {
  if (!PIP_NAME.test(pkg.name) || !EXACT_PIP.test(pkg.version)) throw new AcquisitionError('UNPINNED', `${pkg.name}: pip packages must be an exact version such as 1.2.3.`);
  const body = (await get(`https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}/json`)) as { info?: Record<string, unknown>; urls?: Array<Record<string, unknown>> };
  const wheels = (body.urls ?? []).filter((u) => u.packagetype === 'bdist_wheel' && !u.yanked);
  const hashes = [...new Set(wheels.map((u) => String((u.digests as { sha256?: string } | undefined)?.sha256 ?? '')).filter((h) => /^[0-9a-f]{64}$/.test(h)))];
  if (!hashes.length) throw new AcquisitionError('NO_DIGEST', `${pkg.name}==${pkg.version} has no published wheel with a sha256 digest, so it cannot be installed without building source.`);
  const info = body.info ?? {};
  const licence = String(info.license_expression || info.license || '').replace(/\s+/g, ' ').slice(0, 200)
    || (Array.isArray(info.classifiers) ? (info.classifiers as string[]).filter((c) => c.startsWith('License ::')).map((c) => c.split('::').pop()!.trim()).join(' OR ') : '');
  return { ...pkg, hashes, licence: licence || 'not declared', licenceClass: classifyLicence(licence) };
}

export async function resolveNpm(pkg: PinnedPackage, get: RegistryGet): Promise<ResolvedPackage> {
  if (!NPM_NAME.test(pkg.name) || !EXACT_NPM.test(pkg.version)) throw new AcquisitionError('UNPINNED', `${pkg.name}: npm packages must be an exact version such as 1.2.3.`);
  const body = (await get(`https://registry.npmjs.org/${pkg.name.replace('/', '%2F')}/${encodeURIComponent(pkg.version)}`)) as { dist?: { integrity?: string }; license?: unknown; licenses?: unknown };
  const integrity = String(body.dist?.integrity ?? '');
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)) throw new AcquisitionError('NO_DIGEST', `${pkg.name}@${pkg.version} has no sha512 integrity in the registry.`);
  const raw = typeof body.license === 'string' ? body.license : typeof (body.license as { type?: string } | undefined)?.type === 'string' ? (body.license as { type: string }).type
    : Array.isArray(body.licenses) ? (body.licenses as Array<{ type?: string }>).map((l) => l.type).filter(Boolean).join(' OR ') : '';
  return { ...pkg, hashes: [integrity], licence: raw.slice(0, 200) || 'not declared', licenceClass: classifyLicence(raw) };
}

export interface AcquisitionStage { readonly id: string; readonly command: string; readonly args: readonly string[]; readonly networkPolicy: 'none' | 'registry-only'; readonly timeoutMs: number; readonly cwd?: string }
export interface AcquisitionPlan {
  readonly ecosystem: Ecosystem;
  readonly ready: boolean;
  readonly packages: readonly ResolvedPackage[];
  /** Packages whose licence is not clearly permissive and that were not acknowledged by name. */
  readonly needsReview: readonly ResolvedPackage[];
  readonly files: readonly { path: string; content: string }[];
  /** Install behind the egress allowlist first; the verify stage (npm) and everything the caller runs afterwards is offline. */
  readonly stages: readonly AcquisitionStage[];
}

/**
 * Offline reports of the licences of EVERYTHING that ended up installed, transitive packages included (a lock file does not carry them; each
 * installed package's own metadata does). They print one JSON line: counts per licence and the names whose licence is not clearly permissive.
 * They only read files; the classification mirrors `classifyLicence` in a deliberately simple form and is a pointer for a human, not a verdict.
 */
export const NPM_LICENCE_REPORT = `const fs=require('fs'),path=require('path');const seen={};const review=[];
const ok=/^(?:MIT|MIT-0|ISC|BSD(?:-[0-9]-Clause)?|Apache-2\\.0|0BSD|Unlicense|CC0-1\\.0|BlueOak-1\\.0\\.0|Zlib|Python-2\\.0|CC-BY-4\\.0)$/;
function walk(dir){let names=[];try{names=fs.readdirSync(dir)}catch{return}for(const n of names){if(n.startsWith('.'))continue;const p=path.join(dir,n);if(n.startsWith('@')){walk(p);continue}
let j;try{j=JSON.parse(fs.readFileSync(path.join(p,'package.json'),'utf8'))}catch{continue}
let l=typeof j.license==='string'?j.license:(j.license&&j.license.type)||(Array.isArray(j.licenses)?j.licenses.map(x=>x.type).join(' OR '):'')||'undeclared';
seen[l]=(seen[l]||0)+1;const parts=l.replace(/[()]/g,' ').split(/\\s+(?:OR|AND)\\s+/).map(s=>s.trim());if(!parts.every(s=>ok.test(s)))review.push(j.name+'@'+j.version+' ('+l+')');
walk(path.join(p,'node_modules'))}}
walk('node_modules');console.log(JSON.stringify({packages:Object.values(seen).reduce((a,b)=>a+b,0),licences:seen,needReview:review.slice(0,60),needReviewCount:review.length}));`;
export const PIP_LICENCE_REPORT = `import json,importlib.metadata as m,re
ok=re.compile(r"^(MIT|MIT-0|ISC|BSD.*|Apache.*|0BSD|Unlicense|CC0-1.0|Python-2.0|PSF.*|Zlib)$",re.I)
seen={};review=[]
for d in m.distributions():
    md=d.metadata;l=(md.get("License-Expression") or md.get("License") or "").strip().replace("\\n"," ")
    if not l or len(l)>80:
        c=[x.split("::")[-1].strip() for x in (md.get_all("Classifier") or []) if x.startswith("License ::")];l=" OR ".join(c) or (l[:80] if l else "undeclared")
    seen[l]=seen.get(l,0)+1
    parts=[p.strip() for p in re.split(r"\\s+(?:OR|AND)\\s+",l.replace("(","").replace(")",""))]
    if not all(ok.match(p) or "License" in p and re.search(r"MIT|BSD|Apache|ISC|Python Software",p) for p in parts):review.append("%s==%s (%s)"%(md["Name"],md["Version"],l))
print(json.dumps({"packages":sum(seen.values()),"licences":seen,"needReview":review[:60],"needReviewCount":len(review)}))`;

export interface PlanInput { readonly ecosystem: Ecosystem; readonly packages: readonly PinnedPackage[]; readonly acknowledgedLicences?: readonly string[]; readonly get?: RegistryGet; readonly directory?: string }

export async function buildAcquisitionPlan(input: PlanInput): Promise<AcquisitionPlan> {
  if (!input.packages.length || input.packages.length > 60) throw new AcquisitionError('INVALID', 'Between 1 and 60 pinned packages are supported.');
  const get = input.get ?? publicRegistryGet;
  const resolved: ResolvedPackage[] = [];
  for (const pkg of input.packages) resolved.push(input.ecosystem === 'pip' ? await resolvePip(pkg, get) : await resolveNpm(pkg, get));
  const acknowledged = new Set((input.acknowledgedLicences ?? []).map((n) => n.toLowerCase()));
  const needsReview = resolved.filter((p) => p.licenceClass !== 'permissive' && !acknowledged.has(p.name.toLowerCase()));
  const dir = (input.directory ?? '.xroga-deps').replace(/^\/+|\/+$/g, '');
  if (input.ecosystem === 'pip') {
    const lines = resolved.map((p) => `${p.name}==${p.version} ${p.hashes.map((h) => `--hash=sha256:${h}`).join(' ')}`);
    return {
      ecosystem: 'pip', ready: needsReview.length === 0, packages: resolved, needsReview,
      files: [{ path: `${dir}/requirements.lock.txt`, content: `${lines.join('\n')}\n` }],
      // --require-hashes makes pip reject any requirement without a matching hash (including every transitive one), --only-binary refuses source builds
      stages: [{ id: 'acquire:pip', command: 'python3', args: ['-m', 'pip', 'install', '--require-hashes', '--only-binary=:all:', '--no-input', '-q', '-r', `${dir}/requirements.lock.txt`], networkPolicy: 'registry-only', timeoutMs: 240_000 },
        { id: 'licences:pip', command: 'python3', args: ['-c', PIP_LICENCE_REPORT], networkPolicy: 'none', timeoutMs: 30_000 }],
    };
  }
  const dependencies = Object.fromEntries(resolved.map((p) => [p.name, p.version]));
  const expected = Object.fromEntries(resolved.map((p) => [p.name, p.hashes[0]]));
  // the verify stage runs offline: it compares the integrity npm recorded for each pinned top-level package with the registry digest read on the trusted side
  const verify = `const l=require('./package-lock.json').packages||{};const want=${JSON.stringify(expected)};let bad=[];for(const [n,h] of Object.entries(want)){const e=l['node_modules/'+n];if(!e||e.integrity!==h)bad.push(n)}if(bad.length){console.error('integrity mismatch: '+bad.join(','));process.exit(3)}console.log('integrity verified for '+Object.keys(want).length+' pinned packages')`;
  return {
    ecosystem: 'npm', ready: needsReview.length === 0, packages: resolved, needsReview,
    files: [{ path: `${dir}/package.json`, content: `${JSON.stringify({ name: 'xroga-acquired', private: true, dependencies }, null, 2)}\n` }, { path: `${dir}/verify-integrity.cjs`, content: `${verify}\n` }],
    stages: [
      { id: 'acquire:npm', command: 'npm', args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=true'], networkPolicy: 'registry-only', timeoutMs: 240_000, cwd: dir },
      { id: 'verify:npm', command: 'node', args: ['verify-integrity.cjs'], networkPolicy: 'none', timeoutMs: 30_000, cwd: dir },
      { id: 'licences:npm', command: 'node', args: ['-e', NPM_LICENCE_REPORT], networkPolicy: 'none', timeoutMs: 30_000, cwd: dir },
    ],
  };
}
