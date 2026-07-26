import type { DnsChange, DnsRecord } from './domainAutopilot.js';

export interface DnsMutationEvidence { provider: string; operationId: string; accepted: boolean; submittedAt: string; }
export interface DnsRuntimeAdapter {
  id: 'cloudflare' | 'godaddy' | 'route53';
  listRecords(): Promise<DnsRecord[]>;
  apply(changes: DnsChange[]): Promise<DnsMutationEvidence[]>;
}

function requireAuthorised(changes: DnsChange[]): void {
  if (changes.some((change) => !change.authorised)) throw new Error('DNS mutation contains an unapproved conflict');
}

function responseJson(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
async function checked(response: Response): Promise<Record<string, unknown>> {
  const data = responseJson(await response.json().catch(() => ({})));
  if (!response.ok) throw Object.assign(new Error(`DNS provider request failed (${response.status})`), { status: response.status });
  return data;
}

export class CloudflareDnsAdapter implements DnsRuntimeAdapter {
  readonly id = 'cloudflare' as const;
  constructor(private readonly zoneId: string, private readonly token: string, private readonly request: typeof fetch = fetch) { if (!zoneId || !token) throw new Error('restricted Cloudflare zone token is required'); }
  private headers() { return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }; }
  async listRecords(): Promise<DnsRecord[]> {
    const data = await checked(await this.request(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.zoneId)}/dns_records?per_page=500`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) }));
    return (Array.isArray(data.result) ? data.result : []).map((raw) => { const item = raw as Record<string, unknown>; return { type: String(item.type) as DnsRecord['type'], name: String(item.name ?? ''), value: String(item.content ?? ''), ttl: Number(item.ttl ?? 1), priority: item.priority === undefined ? undefined : Number(item.priority) }; });
  }
  async apply(changes: DnsChange[]): Promise<DnsMutationEvidence[]> {
    requireAuthorised(changes); const evidence: DnsMutationEvidence[] = [];
    for (const change of changes) {
      const record = change.after ?? change.before; if (!record) throw new Error('DNS change lacks record data');
      const list = await checked(await this.request(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.zoneId)}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) }));
      const existing = (Array.isArray(list.result) ? list.result : [])[0] as Record<string, unknown> | undefined;
      const path = existing?.id ? `/dns_records/${encodeURIComponent(String(existing.id))}` : '/dns_records';
      const method = change.action === 'delete' ? 'DELETE' : existing?.id ? 'PUT' : 'POST';
      const response = await checked(await this.request(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.zoneId)}${path}`, { method, headers: this.headers(), body: method === 'DELETE' ? undefined : JSON.stringify({ type: record.type, name: record.name, content: record.value, ttl: record.ttl ?? 1, priority: record.priority }), signal: AbortSignal.timeout(10_000) }));
      const result = responseJson(response.result); const operationId = String(result.id ?? existing?.id ?? '');
      if (!operationId) throw new Error('Cloudflare mutation returned no record evidence');
      evidence.push({ provider: this.id, operationId, accepted: true, submittedAt: new Date().toISOString() });
    }
    return evidence;
  }
}

/** The authenticated transport is supplied by the owner credential implementation.
 * It is responsible for GoDaddy PAT auth or AWS SigV4, keeping secrets out of this contract. */
export interface SignedDnsTransport { request(path: string, init: RequestInit): Promise<Response>; }

export class GoDaddyDnsAdapter implements DnsRuntimeAdapter {
  readonly id = 'godaddy' as const;
  constructor(private readonly domain: string, private readonly transport: SignedDnsTransport) {}
  private path(recordId?: string) { return `/v3/domains/zones/${encodeURIComponent(this.domain)}/dns-records${recordId ? `/${encodeURIComponent(recordId)}` : ''}`; }
  private async rawRecords(): Promise<Array<Record<string, unknown>>> {
    const data = await checked(await this.transport.request(`${this.path()}?pageSize=100`, { method: 'GET', signal: AbortSignal.timeout(10_000) }));
    return Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  }
  async listRecords(): Promise<DnsRecord[]> {
    return (await this.rawRecords()).map((item) => ({ type: String(item.type) as DnsRecord['type'], name: String(item.name ?? '') === '@' ? this.domain : String(item.name ?? ''), value: String(item.data ?? ''), ttl: Number(item.ttl ?? 600), priority: item.priority === undefined ? undefined : Number(item.priority) }));
  }
  async apply(changes: DnsChange[]): Promise<DnsMutationEvidence[]> {
    requireAuthorised(changes); const evidence: DnsMutationEvidence[] = [];
    for (const change of changes) {
      const existing = change.before ? (await this.rawRecords()).find((item) => String(item.type) === change.before!.type && (String(item.name) === change.before!.name || String(item.name) === '@' && change.before!.name === this.domain) && String(item.data) === change.before!.value) : undefined;
      const oldId = String(existing?.recordId ?? '');
      if ((change.action === 'delete' || change.action === 'update') && !oldId) throw new Error('GoDaddy record replacement requires the exact current record identifier');
      if (oldId) {
        const removed = await this.transport.request(this.path(oldId), { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
        if (!removed.ok) throw Object.assign(new Error(`GoDaddy DNS delete failed (${removed.status})`), { status: removed.status });
      }
      if (change.action !== 'delete') {
        const next = change.after!;
        const payload = { type: next.type, name: next.name === this.domain ? '@' : next.name, data: next.value, ttl: Math.max(600, next.ttl ?? 600), ...(next.priority === undefined ? {} : { priority: next.priority }) };
        try {
          const created = await checked(await this.transport.request(this.path(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) }));
          const operationId = String(created.recordId ?? ''); if (!operationId) throw new Error('GoDaddy create returned no record identifier');
          evidence.push({ provider: this.id, operationId, accepted: true, submittedAt: new Date().toISOString() });
        } catch (error) {
          if (change.before) await this.transport.request(this.path(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: change.before.type, name: change.before.name === this.domain ? '@' : change.before.name, data: change.before.value, ttl: Math.max(600, change.before.ttl ?? 600), ...(change.before.priority === undefined ? {} : { priority: change.before.priority }) }) });
          throw error;
        }
      } else evidence.push({ provider: this.id, operationId: oldId, accepted: true, submittedAt: new Date().toISOString() });
    }
    return evidence;
  }
}

export interface Route53Port {
  listRecordSets(hostedZoneId: string): Promise<DnsRecord[]>;
  changeRecordSets(hostedZoneId: string, changes: DnsChange[]): Promise<{ changeId: string }>;
}

export class Route53DnsAdapter implements DnsRuntimeAdapter {
  readonly id = 'route53' as const;
  constructor(private readonly hostedZoneId: string, private readonly port: Route53Port) {}
  async listRecords(): Promise<DnsRecord[]> { return this.port.listRecordSets(this.hostedZoneId); }
  async apply(changes: DnsChange[]): Promise<DnsMutationEvidence[]> {
    requireAuthorised(changes);
    const data = await this.port.changeRecordSets(this.hostedZoneId, changes); const operationId = data.changeId;
    if (!operationId) throw new Error('Route53 change returned no request evidence');
    return [{ provider: this.id, operationId, accepted: true, submittedAt: new Date().toISOString() }];
  }
}
