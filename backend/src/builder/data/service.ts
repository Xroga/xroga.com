import type { ExternalOperation } from '../types.js';
import { BuilderError } from '../types.js';
import { markerFor, OperationRunner, type OperationDeps } from '../operations.js';
import { publicSupabaseEnv } from './env.js';
import { SUPABASE_REF, SupabasePortError, type SupabasePort, type SupabaseProjectSummary } from './port.js';
import { reviewMigration, type MigrationReview } from './review.js';
import { schemaFor, schemaMarker, type GeneratedSchema } from './schema.js';

/**
 * Customer-owned Supabase: select an authorized project, then apply a REVIEWED generated schema.
 *
 * - A project can only be selected from the list Supabase itself returns for the connected account.
 * - Selecting reads nothing secret: only the public URL and publishable key.
 * - Applying needs its own approval showing the exact SQL digest, its risk review and the tables it
 *   will create. A table that already exists and was not created by this Xroga schema blocks the
 *   change, so a customer's existing data is never touched.
 * - After applying, the live catalog is read back: every table must exist with row-level security
 *   and nothing may be readable by signed-out visitors.
 */

export interface SupabaseDataDeps extends OperationDeps {
  readonly supabase: SupabasePort;
  /** The connected user's Supabase OAuth token from the existing vault, or null when none or revoked. */
  readonly tokenFor: (userId: string) => Promise<string | null>;
}

export interface BindPlan extends Record<string, unknown> {
  readonly provider: 'supabase';
  readonly action: 'bind_supabase_project';
  readonly project: SupabaseProjectSummary;
  readonly publicUrl: string;
  readonly marker: string;
  readonly notes: readonly string[];
}

export interface MigrationPlan extends Record<string, unknown> {
  readonly provider: 'supabase';
  readonly action: 'apply_migration';
  readonly projectRef: string;
  readonly projectName: string;
  readonly archetype: string;
  readonly fileName: string;
  readonly sqlDigest: string;
  readonly sql: string;
  readonly risk: MigrationReview['risk'];
  readonly findings: MigrationReview['findings'];
  readonly createsTables: readonly string[];
  readonly protections: readonly string[];
  readonly marker: string;
  readonly warnings: readonly string[];
}

export interface SupabaseBinding {
  readonly projectRef: string;
  readonly projectName: string;
  readonly url: string;
  readonly publishableKey: string;
  readonly existingTables: readonly string[];
  readonly boundAt: string;
}

export class SupabaseDataService {
  private readonly ops: OperationRunner;

  constructor(private readonly deps: SupabaseDataDeps) {
    this.ops = new OperationRunner(deps);
  }

  private async connection(userId: string): Promise<string | null> {
    return this.deps.tokenFor(userId);
  }

  async projects(userId: string): Promise<{ connected: boolean; projects: SupabaseProjectSummary[]; notes: string[] }> {
    const token = await this.connection(userId);
    if (!token) return { connected: false, projects: [], notes: ['Supabase is not connected, or the connection was revoked. Connect Supabase in Xroga to use your own database.'] };
    try {
      return { connected: true, projects: await this.deps.supabase.listProjects(token), notes: [] };
    } catch (error) {
      if (error instanceof SupabasePortError && error.code === 'unauthorized') return { connected: false, projects: [], notes: [error.message] };
      throw error;
    }
  }

  async binding(userId: string, projectId: string): Promise<SupabaseBinding | null> {
    const latest = (await this.ops.succeeded(userId, projectId, 'supabase')).filter((operation) => operation.action === 'bind_supabase_project').pop();
    return latest ? (latest.receipt as unknown as SupabaseBinding) : null;
  }

  async prepareBind(userId: string, projectId: string, input: { operationKey: string; projectRef: string }) {
    if (!SUPABASE_REF.test(input.projectRef)) throw new BuilderError('invalid_input', 'That is not a valid Supabase project reference.');
    const project = await this.deps.builder.requireProject(userId, projectId);
    const token = await this.connection(userId);
    if (!token) throw new BuilderError('conflict', 'Supabase is not connected. Connect your Supabase account first.');
    // The reference must be one of the projects THIS connected account can use, as Supabase reports it.
    const listed = (await this.deps.supabase.listProjects(token)).find((candidate) => candidate.ref === input.projectRef);
    if (!listed) throw new BuilderError('invalid_input', 'That project is not available to your connected Supabase account.');
    if (!project.currentRevisionId) throw new BuilderError('not_found', 'The project has no source revision yet.');
    const plan: BindPlan = {
      provider: 'supabase', action: 'bind_supabase_project', project: listed, publicUrl: `https://${listed.ref}.supabase.co`, marker: markerFor(projectId, input.operationKey),
      notes: [
        'Xroga will use this project for your app\'s database and sign-in. It stays in your Supabase account.',
        'Xroga reads only the public URL and publishable key. It does not read your secret or service-role key.',
        'Nothing is changed in the project by selecting it.',
      ],
    };
    return { ...(await this.ops.prepare(userId, projectId, { provider: 'supabase', action: 'bind_supabase_project', operationKey: input.operationKey, revisionId: project.currentRevisionId, plan })), plan };
  }

  approve(userId: string, projectId: string, operationId: string, digest: string) {
    return this.ops.approve(userId, projectId, operationId, { digest }, { provider: 'supabase', actions: ['bind_supabase_project', 'apply_migration'] });
  }

  cancel(userId: string, projectId: string, operationId: string) {
    return this.ops.cancel(userId, projectId, operationId, { provider: 'supabase', actions: ['bind_supabase_project', 'apply_migration'] });
  }

  operations(userId: string, projectId: string) {
    return this.ops.list(userId, projectId, 'supabase');
  }

  async executeBind(userId: string, projectId: string, operationId: string): Promise<ExternalOperation> {
    const { operation, replay } = await this.ops.claim(userId, projectId, operationId, { provider: 'supabase', action: 'bind_supabase_project' });
    if (replay) return operation;
    const plan = operation.plan as BindPlan;
    const token = await this.connection(userId);
    if (!token) return this.ops.fail(userId, projectId, operationId, 'failed', 'Supabase is no longer connected. Nothing was changed.');
    try {
      const listed = (await this.deps.supabase.listProjects(token)).find((candidate) => candidate.ref === plan.project.ref && candidate.organizationId === plan.project.organizationId);
      if (!listed) return await this.ops.fail(userId, projectId, operationId, 'failed', 'The project is no longer available to your connected Supabase account. Nothing was changed.');
      const config = await this.deps.supabase.getPublicConfig(token, listed.ref);
      publicSupabaseEnv(config); // proves what would be sent can never be a privileged credential
      const catalog = await this.deps.supabase.inspect(token, listed.ref);
      const binding: SupabaseBinding = {
        projectRef: listed.ref, projectName: listed.name, url: config.url, publishableKey: config.publishableKey,
        existingTables: catalog.tables.map((table) => table.name), boundAt: this.ops.now().toISOString(),
      };
      return await this.ops.succeed(userId, projectId, operationId, binding as unknown as Record<string, unknown>);
    } catch (error) {
      if (error instanceof BuilderError) throw error;
      return this.ops.fail(userId, projectId, operationId, 'failed', error instanceof SupabasePortError ? error.message : 'Selecting the Supabase project stopped unexpectedly. Nothing was changed.');
    }
  }

  /** The reviewed schema this project's requirements call for, or null when no database is needed. */
  /** Whether this app needs a customer database schema, and whether the reviewed schema has been applied and verified. */
  async databaseStatus(userId: string, projectId: string): Promise<{ required: boolean; applied: boolean }> {
    const project = await this.deps.builder.requireProject(userId, projectId);
    const required = schemaFor(project.spec) !== null;
    if (!required) return { required: false, applied: false };
    const applied = (await this.ops.succeeded(userId, projectId, 'supabase')).some((operation) => operation.action === 'apply_migration');
    return { required, applied };
  }

  async schemaFor(userId: string, projectId: string): Promise<GeneratedSchema | null> {
    const project = await this.deps.builder.requireProject(userId, projectId);
    return schemaFor(project.spec);
  }

  async prepareMigration(userId: string, projectId: string, input: { operationKey: string }) {
    const project = await this.deps.builder.requireProject(userId, projectId);
    const binding = await this.binding(userId, projectId);
    if (!binding) throw new BuilderError('conflict', 'Select your Supabase project first.');
    const schema = schemaFor(project.spec);
    if (!schema) throw new BuilderError('unsupported', 'This project does not need a database.');
    const review = reviewMigration(schema.sql);
    if (!review.appliable) throw new BuilderError('invalid_input', `The generated migration failed review: ${review.findings.find((finding) => finding.level === 'destructive')?.message ?? 'destructive change'}`);
    const token = await this.connection(userId);
    if (!token) throw new BuilderError('conflict', 'Supabase is not connected. Reconnect it first.');
    const catalog = await this.deps.supabase.inspect(token, binding.projectRef);
    const conflicts = this.conflicts(schema, catalog);
    if (conflicts.length > 0) {
      throw new BuilderError('conflict', `Your project already has ${conflicts.map((name) => `"${name}"`).join(', ')}. Xroga will not change tables it did not create. Use a different Supabase project or rename those tables.`);
    }
    const warnings = ['This changes the database of YOUR Supabase project. Xroga creates new tables only and never deletes or edits existing data.'];
    if (catalog.tables.length > 0) warnings.push(`The project already contains ${catalog.tables.length} table(s). They are left exactly as they are.`);
    const plan: MigrationPlan = {
      provider: 'supabase', action: 'apply_migration', projectRef: binding.projectRef, projectName: binding.projectName, archetype: schema.archetype, fileName: schema.fileName,
      sqlDigest: review.digest, sql: schema.sql, risk: review.risk, findings: review.findings, createsTables: schema.tables, protections: schema.protections,
      marker: markerFor(projectId, input.operationKey), warnings,
    };
    return { ...(await this.ops.prepare(userId, projectId, { provider: 'supabase', action: 'apply_migration', operationKey: input.operationKey, revisionId: project.currentRevisionId as string, plan })), plan };
  }

  /** Tables the schema would create that already exist and are not marked as created by this Xroga schema. */
  private conflicts(schema: GeneratedSchema, catalog: { tables: ReadonlyArray<{ name: string; comment: string | null }> }): string[] {
    const marker = schemaMarker(schema.archetype);
    return schema.tables.filter((table) => {
      const existing = catalog.tables.find((candidate) => candidate.name === table);
      return Boolean(existing) && existing?.comment !== marker;
    });
  }

  async executeMigration(userId: string, projectId: string, operationId: string): Promise<ExternalOperation> {
    const { operation, replay } = await this.ops.claim(userId, projectId, operationId, { provider: 'supabase', action: 'apply_migration' });
    if (replay) return operation;
    const plan = operation.plan as MigrationPlan;
    const binding = await this.binding(userId, projectId);
    if (!binding || binding.projectRef !== plan.projectRef) return this.ops.fail(userId, projectId, operationId, 'failed', 'The selected Supabase project changed since this was approved. Nothing was changed.');
    const token = await this.connection(userId);
    if (!token) return this.ops.fail(userId, projectId, operationId, 'failed', 'Supabase is no longer connected. Nothing was changed.');
    const project = await this.deps.builder.requireProject(userId, projectId);
    const schema = schemaFor(project.spec);
    // The approved SQL must be exactly what the requirements still generate.
    if (!schema || reviewMigration(schema.sql).digest !== plan.sqlDigest || schema.sql !== plan.sql) return this.ops.fail(userId, projectId, operationId, 'failed', 'The migration no longer matches what was approved. Nothing was changed.');
    try {
      const before = await this.deps.supabase.inspect(token, plan.projectRef);
      const conflicts = this.conflicts(schema, before);
      if (conflicts.length > 0) return await this.ops.fail(userId, projectId, operationId, 'failed', `A table named ${conflicts.join(', ')} appeared in your project and was not created by Xroga. Nothing was changed.`);
      const alreadyApplied = schema.tables.every((table) => before.tables.find((candidate) => candidate.name === table)?.comment === schemaMarker(schema.archetype));
      let applied = false;
      if (!alreadyApplied) {
        try {
          await this.deps.supabase.applySql(token, plan.projectRef, schema.sql);
          applied = true;
        } catch (error) {
          if (error instanceof SupabasePortError && error.ambiguous) {
            // The request may have applied: read the catalog before deciding anything.
            const after = await this.deps.supabase.inspect(token, plan.projectRef).catch(() => null);
            const nowApplied = after !== null && schema.tables.every((table) => after.tables.find((candidate) => candidate.name === table)?.comment === schemaMarker(schema.archetype));
            if (!nowApplied) return await this.ops.fail(userId, projectId, operationId, 'ambiguous', 'Supabase did not confirm whether the schema was applied. Nothing is recorded as applied. Check your project, then retry: a retry adopts the schema only if Xroga created it.');
            applied = true;
          } else throw error;
        }
      }
      // Verify what the database really holds, not what was sent.
      const catalog = await this.deps.supabase.inspect(token, plan.projectRef);
      const problems: string[] = [];
      for (const table of schema.tables) {
        const found = catalog.tables.find((candidate) => candidate.name === table);
        if (!found) problems.push(`${table} is missing`);
        else if (!found.rls) problems.push(`${table} has row-level security OFF`);
      }
      for (const table of schema.tables) if (catalog.anonGrants.includes(table)) problems.push(`${table} is readable by signed-out visitors`);
      if (problems.length > 0) return await this.ops.fail(userId, projectId, operationId, 'failed', `The schema was applied but failed verification: ${problems.join('; ')}.`, { applied, verified: false, problems });
      return await this.ops.succeed(userId, projectId, operationId, {
        projectRef: plan.projectRef, archetype: schema.archetype, fileName: schema.fileName, sqlDigest: plan.sqlDigest, tables: schema.tables, adoptedExisting: !applied,
        verified: { allTablesExist: true, rlsEnabled: true, noSignedOutAccess: true }, verifiedAt: this.ops.now().toISOString(),
        note: 'Verified against the live catalog. Cross-user access was tested on a real PostgreSQL in Xroga\'s test suite, not on this project.',
      });
    } catch (error) {
      if (error instanceof BuilderError) throw error;
      return this.ops.fail(userId, projectId, operationId, 'failed', error instanceof SupabasePortError ? error.message : 'Applying the schema stopped unexpectedly. Nothing further was changed.');
    }
  }

  /** What the generated app should be configured with: only the public URL and publishable key. */
  async appEnvironment(userId: string, projectId: string): Promise<Record<string, string> | null> {
    const binding = await this.binding(userId, projectId);
    return binding ? publicSupabaseEnv({ url: binding.url, publishableKey: binding.publishableKey }) : null;
  }
}
