import { createHash } from 'crypto';

export type DomainStatus = 'not_configured' | 'detecting_provider' | 'provider_detected' | 'authorisation_required' | 'authorisation_pending' | 'configuring_dns' | 'dns_change_submitted' | 'waiting_for_propagation' | 'ownership_verification_pending' | 'ssl_provisioning' | 'verifying_https' | 'live' | 'action_required' | 'blocked' | 'failed' | 'rolled_back';
export type DnsProviderId = 'vercel_dns' | 'domain_connect' | 'cloudflare' | 'godaddy' | 'spaceship' | 'route53' | 'guided_fallback';
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'CAA' | 'NS' | 'SRV';

export interface DnsRecord { type: DnsRecordType; name: string; value: string; ttl?: number; priority?: number; }
export interface DnsSnapshot { domain: string; records: DnsRecord[]; capturedAt: string; hash: string; }
export interface DnsChange { action: 'create' | 'update' | 'delete'; before?: DnsRecord; after?: DnsRecord; destructive: boolean; reason: string; authorised: boolean; }

export interface DomainProviderAdapter {
  schemaVersion: '1.0.0'; migrationPath: string[]; id: DnsProviderId; authentication: string;
  minimumPermissions: string[]; supportsAutomaticWrites: boolean; preservesRecords: boolean;
  source: { url: string; verifiedAt: string; expiresAt: string };
}

const sourceWindow = { verifiedAt: '2026-07-26T00:00:00Z', expiresAt: '2026-10-26T00:00:00Z' };
export const DOMAIN_PROVIDER_ADAPTERS: DomainProviderAdapter[] = [
  { schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial DNS provider contract'], id: 'vercel_dns', authentication: 'user-owned Vercel access token', minimumPermissions: ['project domain and DNS access'], supportsAutomaticWrites: true, preservesRecords: true, source: { url: 'https://vercel.com/docs/rest-api', ...sourceWindow } },
  { schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial DNS provider contract'], id: 'domain_connect', authentication: 'one-time authorization on registrar official page', minimumPermissions: ['template-scoped DNS changes'], supportsAutomaticWrites: true, preservesRecords: true, source: { url: 'https://www.domainconnect.org/', ...sourceWindow } },
  { schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial DNS provider contract'], id: 'cloudflare', authentication: 'restricted API token', minimumPermissions: ['Zone Read', 'DNS Write for selected zone'], supportsAutomaticWrites: true, preservesRecords: true, source: { url: 'https://developers.cloudflare.com/dns/manage-dns-records/', ...sourceWindow } },
  { schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial DNS provider contract'], id: 'godaddy', authentication: 'scoped bearer token', minimumPermissions: ['domains.domain:read', 'domains.dns:update'], supportsAutomaticWrites: true, preservesRecords: true, source: { url: 'https://developer.godaddy.com/en/docs/api-users/manage-domains/dns', ...sourceWindow } },
  { schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial DNS provider contract'], id: 'spaceship', authentication: 'user-owned official connector credential', minimumPermissions: ['selected-domain DNS read/write'], supportsAutomaticWrites: false, preservesRecords: true, source: { url: 'https://www.spaceship.com/api/', ...sourceWindow } },
  { schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial DNS provider contract'], id: 'route53', authentication: 'restricted IAM role or credentials', minimumPermissions: ['route53:ListResourceRecordSets on selected zone', 'route53:ChangeResourceRecordSets constrained by name/type/action'], supportsAutomaticWrites: true, preservesRecords: true, source: { url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-permissions.html', ...sourceWindow } },
  { schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial DNS provider contract'], id: 'guided_fallback', authentication: 'none; owner performs unavoidable provider-side record edit', minimumPermissions: [], supportsAutomaticWrites: false, preservesRecords: true, source: { url: 'https://vercel.com/docs/domains/set-up-custom-domain', ...sourceWindow } },
];

export function validateDomainName(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.$/, '');
  if (domain.length > 253 || !domain.includes('.') || domain.split('.').some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))) throw new Error('invalid domain name');
  return domain;
}

export function snapshotDns(domainValue: string, records: DnsRecord[], now = new Date()): DnsSnapshot {
  const domain = validateDomainName(domainValue);
  const normalized = records.map((record) => ({ ...record, name: record.name.toLowerCase().replace(/\.$/, ''), value: record.value.trim() })).sort((a, b) => `${a.type}:${a.name}:${a.value}`.localeCompare(`${b.type}:${b.name}:${b.value}`));
  return { domain, records: normalized, capturedAt: now.toISOString(), hash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex') };
}

const protectedRecord = (record: DnsRecord) => record.type === 'MX' || record.type === 'CAA' || (record.type === 'TXT' && /(?:spf|dkim|dmarc|verification)/i.test(`${record.name} ${record.value}`));

export function planDnsChanges(snapshot: DnsSnapshot, required: DnsRecord[], authorisedConflicts: string[] = []): DnsChange[] {
  const result: DnsChange[] = [];
  for (const next of required) {
    const exact = snapshot.records.find((record) => record.type === next.type && record.name === next.name && record.value === next.value);
    if (exact) continue;
    const conflict = snapshot.records.find((record) => record.name === next.name && record.type === next.type);
    if (!conflict) result.push({ action: 'create', after: next, destructive: false, reason: 'required record is absent', authorised: true });
    else {
      const key = `${conflict.type}:${conflict.name}:${conflict.value}`;
      const authorised = authorisedConflicts.includes(key);
      result.push({ action: 'update', before: conflict, after: next, destructive: true, reason: protectedRecord(conflict) ? 'protected DNS record conflicts and requires explicit owner approval' : 'existing record conflicts and requires explicit owner approval', authorised });
    }
  }
  return result;
}

export function rollbackRecords(changes: DnsChange[]): DnsChange[] {
  return [...changes].reverse().map((change) => change.action === 'create'
    ? { action: 'delete', before: change.after, destructive: true, reason: 'rollback created record', authorised: true }
    : { action: 'update', before: change.after, after: change.before, destructive: false, reason: 'restore pre-change snapshot', authorised: true });
}

export function detectDnsProvider(nameservers: string[], domainConnectDiscovered: boolean, inVercelAccount: boolean): DnsProviderId {
  const joined = nameservers.join(' ').toLowerCase();
  if (inVercelAccount || /vercel-dns/.test(joined)) return 'vercel_dns';
  if (domainConnectDiscovered) return 'domain_connect';
  if (/cloudflare/.test(joined)) return 'cloudflare';
  if (/domaincontrol|godaddy/.test(joined)) return 'godaddy';
  if (/spaceship/.test(joined)) return 'spaceship';
  if (/awsdns/.test(joined)) return 'route53';
  return 'guided_fallback';
}

export interface DomainEvidence { vercelAccepted: boolean; dnsResolved: boolean; ownershipVerified: boolean; sslValid: boolean; httpsResponded: boolean; expectedProductReached: boolean; redirectValid: boolean; checkedAt: string; }
export function evaluateDomainEvidence(evidence: DomainEvidence): DomainStatus {
  if (!evidence.vercelAccepted) return 'ownership_verification_pending';
  if (!evidence.dnsResolved) return 'waiting_for_propagation';
  if (!evidence.ownershipVerified) return 'ownership_verification_pending';
  if (!evidence.sslValid) return 'ssl_provisioning';
  if (!evidence.httpsResponded || !evidence.expectedProductReached || !evidence.redirectValid) return 'verifying_https';
  return 'live';
}

type FetchLike = typeof fetch;
export class VercelDomainClient {
  constructor(private readonly token: string, private readonly request: FetchLike = fetch, private readonly teamId?: string) { if (!token) throw new Error('user-owned Vercel token is required'); }
  private url(path: string) { const url = new URL(path, 'https://api.vercel.com'); if (this.teamId) url.searchParams.set('teamId', this.teamId); return url; }
  private async call(path: string, init: RequestInit = {}) { const response = await this.request(this.url(path), { ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...init.headers }, signal: init.signal ?? AbortSignal.timeout(15_000) }); const data = await response.json().catch(() => ({})) as Record<string, unknown>; if (!response.ok) throw Object.assign(new Error(`Vercel domain request failed (${response.status})`), { status: response.status }); return data; }
  addToProject(project: string, domain: string) { return this.call(`/v10/projects/${encodeURIComponent(project)}/domains`, { method: 'POST', body: JSON.stringify({ name: validateDomainName(domain) }) }); }
  verifyProjectDomain(project: string, domain: string) { return this.call(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(validateDomainName(domain))}/verify`, { method: 'POST' }); }
  getConfiguration(domain: string) { return this.call(`/v6/domains/${encodeURIComponent(validateDomainName(domain))}/config`); }
}

/** Purchase is deliberately a port: a current official SDK/connector supplies the
 * registrar implementation, so stale or guessed REST paths can never charge a user. */
export interface DomainRegistrarPort {
  availability(domain: string): Promise<{ available: boolean; evidenceId: string }>;
  price(domain: string): Promise<{ amount: number; currency: string; evidenceId: string }>;
  purchase(input: { domain: string; expectedPrice: number; currency: string; contactInformation: Record<string, unknown>; idempotencyKey: string }): Promise<{ orderId: string; status: string }>;
}

export async function purchaseDomainWithAuthorisation(input: {
  registrar: DomainRegistrarPort; domain: string; explicitConfirmation: boolean;
  confirmedPriceEvidenceId: string; expectedPrice: number; currency: string;
  contactInformation: Record<string, unknown>; idempotencyKey: string;
}) {
  const domain = validateDomainName(input.domain);
  if (!input.explicitConfirmation) throw new Error('domain purchase requires explicit owner confirmation');
  if (!input.confirmedPriceEvidenceId || !input.idempotencyKey) throw new Error('price evidence and idempotency key are required');
  const availability = await input.registrar.availability(domain);
  const price = await input.registrar.price(domain);
  if (!availability.available) throw new Error('confirmed domain is unavailable');
  if (price.evidenceId !== input.confirmedPriceEvidenceId || price.amount !== input.expectedPrice || price.currency !== input.currency) {
    throw new Error('domain price changed; owner confirmation must be renewed');
  }
  const result = await input.registrar.purchase({ domain, expectedPrice: price.amount, currency: price.currency, contactInformation: input.contactInformation, idempotencyKey: input.idempotencyKey });
  if (!result.orderId) throw new Error('registrar did not return real order evidence');
  return result;
}

export function createDomainConnectAuthorisation(input: {
  templateUrl: string; domain: string; providerId: string; serviceId: string;
  redirectUrl: string; state: string; parameters: Record<string, string>;
}): string {
  const template = new URL(input.templateUrl);
  if (template.protocol !== 'https:' || template.username || template.password) throw new Error('Domain Connect template must be an HTTPS provider URL');
  const redirect = new URL(input.redirectUrl);
  if (redirect.protocol !== 'https:') throw new Error('Domain Connect redirect must use HTTPS');
  if (!/^[A-Za-z0-9._~-]{16,256}$/.test(input.state)) throw new Error('Domain Connect state must be an unguessable safe token');
  template.searchParams.set('domain', validateDomainName(input.domain));
  template.searchParams.set('providerId', input.providerId);
  template.searchParams.set('serviceId', input.serviceId);
  template.searchParams.set('redirect_uri', redirect.toString());
  template.searchParams.set('state', input.state);
  for (const [name, value] of Object.entries(input.parameters)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)) throw new Error('invalid Domain Connect parameter name');
    template.searchParams.set(name, value);
  }
  return template.toString();
}

export function guidedDnsFallback(domain: string, required: DnsRecord[]): { status: 'action_required'; steps: string[]; records: DnsRecord[] } {
  validateDomainName(domain);
  return { status: 'action_required', steps: ['Open the authoritative DNS provider settings', 'Add only the listed records; do not remove unrelated records', 'Return to Xroga; DNS, ownership, SSL, HTTPS and redirect checks will continue automatically'], records: required };
}
