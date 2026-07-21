/**
 * Attach / verify custom domains on the user's Vercel project.
 * Uses the user's OAuth/PAT token — never platform VERCEL_API_KEY for their domains.
 */

export interface VercelDomainConfig {
  configuredBy?: { value?: string; type?: string };
  name?: string;
  type?: string;
}

export interface VercelDomainInfo {
  name: string;
  verified: boolean;
  verification?: Array<{ type: string; domain: string; value: string; reason?: string }>;
  configuredBy?: VercelDomainConfig | null;
  error?: string;
}

function teamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

async function vercelJson<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => null)) as T & { error?: { message?: string }; message?: string } | null;
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string }; message?: string } | null)?.error?.message ||
      (data as { message?: string } | null)?.message ||
      `Vercel HTTP ${res.status}`;
    return { ok: false, status: res.status, data: null, error: msg };
  }
  return { ok: true, status: res.status, data: data as T };
}

export async function listProjectDomains(
  token: string,
  projectNameOrId: string,
  teamId?: string,
): Promise<{ ok: boolean; domains: VercelDomainInfo[]; error?: string }> {
  const q = teamQuery(teamId);
  const result = await vercelJson<{ domains?: VercelDomainInfo[] }>(
    token,
    `/v9/projects/${encodeURIComponent(projectNameOrId)}/domains${q}`,
  );
  if (!result.ok) return { ok: false, domains: [], error: result.error };
  return { ok: true, domains: result.data?.domains ?? [] };
}

export async function addProjectDomain(
  token: string,
  projectNameOrId: string,
  domain: string,
  teamId?: string,
): Promise<{ ok: boolean; domain?: VercelDomainInfo; error?: string }> {
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(clean)) {
    return { ok: false, error: 'Enter a valid domain like app.example.com' };
  }
  const q = teamQuery(teamId);
  const result = await vercelJson<VercelDomainInfo>(
    token,
    `/v10/projects/${encodeURIComponent(projectNameOrId)}/domains${q}`,
    { method: 'POST', body: JSON.stringify({ name: clean }) },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, domain: result.data ?? { name: clean, verified: false } };
}

export async function getProjectDomain(
  token: string,
  projectNameOrId: string,
  domain: string,
  teamId?: string,
): Promise<{ ok: boolean; domain?: VercelDomainInfo; error?: string }> {
  const q = teamQuery(teamId);
  const result = await vercelJson<VercelDomainInfo>(
    token,
    `/v9/projects/${encodeURIComponent(projectNameOrId)}/domains/${encodeURIComponent(domain)}${q}`,
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, domain: result.data ?? undefined };
}

/** Ask Vercel to re-check DNS / TXT verification for a domain. */
export async function verifyProjectDomain(
  token: string,
  projectNameOrId: string,
  domain: string,
  teamId?: string,
): Promise<{ ok: boolean; verified: boolean; domain?: VercelDomainInfo; error?: string }> {
  const q = teamQuery(teamId);
  const result = await vercelJson<VercelDomainInfo & { verified?: boolean }>(
    token,
    `/v9/projects/${encodeURIComponent(projectNameOrId)}/domains/${encodeURIComponent(domain)}/verify${q}`,
    { method: 'POST', body: '{}' },
  );
  if (!result.ok) {
    // Fall back to GET status if verify endpoint rejects
    const current = await getProjectDomain(token, projectNameOrId, domain, teamId);
    if (current.ok && current.domain) {
      return {
        ok: true,
        verified: Boolean(current.domain.verified),
        domain: current.domain,
        error: result.error,
      };
    }
    return { ok: false, verified: false, error: result.error };
  }
  const verified = Boolean(result.data?.verified);
  return { ok: true, verified, domain: result.data ?? undefined };
}

export async function removeProjectDomain(
  token: string,
  projectNameOrId: string,
  domain: string,
  teamId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const q = teamQuery(teamId);
  const result = await vercelJson<unknown>(
    token,
    `/v9/projects/${encodeURIComponent(projectNameOrId)}/domains/${encodeURIComponent(domain)}${q}`,
    { method: 'DELETE' },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
