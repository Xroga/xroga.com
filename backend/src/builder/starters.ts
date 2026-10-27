import type { ProjectFile } from '../ai/patches.js';
import { buildScaffoldForPrompt } from '../services/projectScaffold.js';
import { BuilderError, type BuildSpec, type StarterProvenance } from './types.js';
import { hashSnapshot } from './snapshot.js';

/**
 * Approved starter registry.
 *
 * Reuse order (spec section 4): existing tested Xroga scaffold, then a compatible official starter,
 * then generated code. Only `active` entries can be selected. An upstream starter becomes `active`
 * only after its exact revision is vendored, pinned and built; until then it is recorded with the
 * evidence gathered so far and is never fetched or executed.
 */
export interface StarterEntry {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly status: 'active' | 'admitted_pending_vendoring';
  readonly license: string;
  readonly upstream: { readonly repository: string; readonly revision: string; readonly checkedAt: string } | null;
  readonly framework: 'static-web' | 'nextjs';
  readonly supports: { readonly backend: boolean; readonly authentication: boolean; readonly database: boolean };
  readonly notes: readonly string[];
  readonly materialize?: (input: { prompt: string; title: string }) => ProjectFile[];
}

export const STARTER_REGISTRY: readonly StarterEntry[] = [
  {
    id: 'xroga-static-site',
    version: '1',
    label: 'Responsive static website',
    status: 'active',
    license: 'Xroga-original',
    upstream: null,
    framework: 'static-web',
    supports: { backend: false, authentication: false, database: false },
    notes: ['Deterministic themed site from the existing scaffold; no database or auth dependency.'],
    materialize: ({ prompt, title }) => {
      const scaffold = buildScaffoldForPrompt({ prompt, projectName: title });
      if (scaffold.kind !== 'static') throw new BuilderError('unsupported', 'Static starter produced a non-static scaffold.');
      return scaffold.files;
    },
  },
  {
    id: 'xroga-nextjs-app',
    version: '1',
    label: 'Next.js App Router application',
    status: 'active',
    license: 'Xroga-original',
    upstream: null,
    framework: 'nextjs',
    supports: { backend: true, authentication: true, database: true },
    notes: [
      'Existing tested Next.js scaffold. Data and auth target the customer-owned Supabase project, never the Xroga platform database.',
      'Development uses disposable local persistence until a customer project is connected (Phase 3).',
    ],
    materialize: ({ prompt, title }) => {
      const scaffold = buildScaffoldForPrompt({ prompt, projectName: title });
      if (scaffold.kind !== 'nextjs') throw new BuilderError('unsupported', 'Next.js starter produced a non-Next.js scaffold.');
      return scaffold.files;
    },
  },
  {
    id: 'nextjs-with-supabase-official',
    version: '0',
    label: 'Official Next.js + Supabase example',
    status: 'admitted_pending_vendoring',
    license: 'MIT',
    upstream: { repository: 'vercel/next.js (examples/with-supabase)', revision: '6be1a0e9654ed6c3758c772584eaf257d42665b7', checkedAt: '2026-10-26' },
    framework: 'nextjs',
    supports: { backend: true, authentication: true, database: true },
    notes: [
      'License MIT verified. Revision pinned from the canary branch history on 2026-10-26.',
      'The upstream package.json uses "latest" for next, @supabase/ssr and @supabase/supabase-js. It must be vendored with exact pinned versions and a lockfile, and pass build and tests, before it can be selected. Not fetched or executed by Xroga.',
    ],
  },
];

export interface StarterSelection {
  readonly starter: StarterEntry;
  readonly reason: string;
}

/** Deterministic selection. Unsupported requests fail visibly instead of becoming a website. */
export function selectStarter(spec: BuildSpec, registry: readonly StarterEntry[] = STARTER_REGISTRY): StarterSelection {
  if (spec.productType === 'expo' || spec.productType === 'chrome' || spec.productType === 'electron') {
    throw new BuilderError('unsupported', `The web product builder does not generate ${spec.productType} products.`);
  }
  const needs = spec.technicalRequirements;
  const active = registry.filter((entry) => entry.status === 'active');
  const wantsFullStack = needs.requiresBackend || needs.requiresAuthentication || needs.requiresDatabase || spec.technicalRequirements.framework === 'nextjs';
  const candidates = active.filter((entry) => {
    if (needs.requiresBackend && !entry.supports.backend) return false;
    if (needs.requiresAuthentication && !entry.supports.authentication) return false;
    if (needs.requiresDatabase && !entry.supports.database) return false;
    return true;
  });
  if (candidates.length === 0) {
    throw new BuilderError('unsupported', 'No approved starter supports this combination of requirements.');
  }
  // Prefer the simplest foundation that satisfies every requirement: one coherent stack per product.
  const chosen = wantsFullStack
    ? candidates.find((entry) => entry.framework === 'nextjs')
    : candidates.find((entry) => entry.framework === 'static-web') ?? candidates[0];
  if (!chosen) throw new BuilderError('unsupported', 'No approved starter supports this combination of requirements.');
  const reason = wantsFullStack
    ? `Requires ${[needs.requiresBackend && 'a backend', needs.requiresAuthentication && 'authentication', needs.requiresDatabase && 'a database'].filter(Boolean).join(', ') || 'a framework application'}: selected ${chosen.label}.`
    : `No backend, authentication or database requirement: selected the lightweight ${chosen.label}.`;
  return { starter: chosen, reason };
}

export function materializeStarter(
  selection: StarterSelection,
  input: { prompt: string; title: string },
): { files: ProjectFile[]; provenance: StarterProvenance } {
  const { starter } = selection;
  if (starter.status !== 'active' || !starter.materialize) {
    throw new BuilderError('unsupported', `Starter ${starter.id} is not admitted for use.`);
  }
  const files = starter.materialize(input);
  return {
    files,
    provenance: {
      starterId: starter.id,
      starterVersion: starter.version,
      license: starter.license,
      upstream: starter.upstream ? { repository: starter.upstream.repository, revision: starter.upstream.revision } : null,
      seedSha256: hashSnapshot(files),
      selectionReason: selection.reason,
    },
  };
}
