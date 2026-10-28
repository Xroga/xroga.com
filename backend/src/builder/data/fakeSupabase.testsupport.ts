import { SupabasePortError, type SupabaseCatalog, type SupabasePort, type SupabaseProjectSummary, type SupabasePublicConfig } from './port.js';
import { splitStatements } from './review.js';

/**
 * In-memory Supabase Management API for tests. `applySql` really interprets the statements it is
 * given (tables created, RLS enabled, comments, grants) so the service's read-back verification is
 * exercised rather than assumed. It can simulate lost responses and a schema that comes back unsafe.
 */
interface FakeTable {
  rls: boolean;
  comment: string | null;
  anon: boolean;
}

export interface FakeProject extends SupabaseProjectSummary {
  readonly tables: Map<string, FakeTable>;
  readonly publishableKey: string;
}

export interface FakeSupabaseFailures {
  apply?: 'timeout_after_apply' | 'timeout_before_apply' | 'rls_off' | 'forbidden';
  inspect?: 'unavailable';
}

export class FakeSupabase implements SupabasePort {
  readonly accounts = new Map<string, FakeProject[]>();
  readonly calls: string[] = [];
  readonly appliedSql: string[] = [];
  failures: FakeSupabaseFailures = {};

  addAccount(token: string, projects: Array<{ ref: string; name: string; tables?: Record<string, { comment?: string | null; rls?: boolean }> }>): void {
    this.accounts.set(token, projects.map((project) => ({
      ref: project.ref, name: project.name, organizationId: 'org_1', region: 'us-east-1', publishableKey: `sb_publishable_${project.ref}`,
      tables: new Map(Object.entries(project.tables ?? {}).map(([name, table]) => [name, { rls: table.rls ?? true, comment: table.comment ?? null, anon: false }])),
    })));
  }

  private projects(token: string): FakeProject[] {
    const projects = this.accounts.get(token);
    if (!projects) throw new SupabasePortError('unauthorized', 'bad credentials');
    return projects;
  }

  private project(token: string, ref: string): FakeProject {
    const found = this.projects(token).find((candidate) => candidate.ref === ref);
    if (!found) throw new SupabasePortError('not_found', 'no such project');
    return found;
  }

  async listProjects(token: string): Promise<SupabaseProjectSummary[]> {
    this.calls.push('listProjects');
    return this.projects(token).map(({ ref, name, organizationId, region }) => ({ ref, name, organizationId, region }));
  }

  async getPublicConfig(token: string, ref: string): Promise<SupabasePublicConfig> {
    this.calls.push(`getPublicConfig ${ref}`);
    const project = this.project(token, ref);
    return { url: `https://${ref}.supabase.co`, publishableKey: project.publishableKey };
  }

  async applySql(token: string, ref: string, sql: string): Promise<void> {
    this.calls.push(`applySql ${ref}`);
    const project = this.project(token, ref);
    if (this.failures.apply === 'forbidden') throw new SupabasePortError('forbidden', 'denied');
    if (this.failures.apply === 'timeout_before_apply') throw new SupabasePortError('unavailable', 'unreachable', true);
    this.appliedSql.push(sql);
    for (const raw of splitStatements(sql)) {
      const statement = raw.replace(/\s+/g, ' ').trim();
      const created = /^create table (?:if not exists )?public\.(\w+)/i.exec(statement);
      if (created && !project.tables.has(created[1])) project.tables.set(created[1], { rls: false, comment: null, anon: false });
      const rls = /^alter table public\.(\w+) enable row level security/i.exec(statement);
      if (rls && this.failures.apply !== 'rls_off') {
        const table = project.tables.get(rls[1]);
        if (table) table.rls = true;
      }
      const comment = /^comment on table public\.(\w+) is '([^']*)'/i.exec(statement);
      if (comment) {
        const table = project.tables.get(comment[1]);
        if (table) table.comment = comment[2];
      }
    }
    if (this.failures.apply === 'timeout_after_apply') throw new SupabasePortError('unavailable', 'unreachable', true);
  }

  async inspect(token: string, ref: string): Promise<SupabaseCatalog> {
    this.calls.push(`inspect ${ref}`);
    if (this.failures.inspect === 'unavailable') throw new SupabasePortError('unavailable', 'unreachable');
    const project = this.project(token, ref);
    return {
      tables: [...project.tables].map(([name, table]) => ({ name, rls: table.rls, comment: table.comment })),
      anonGrants: [...project.tables].filter(([, table]) => table.anon).map(([name]) => name),
    };
  }
}
