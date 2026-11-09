'use client';

import { defineComponent } from '@openuidev/react-lang';
import { ArrowUpRight, Globe } from 'lucide-react';
import { siCloudflare, siGithub, siNextdotjs, siPostgresql, siReact, siStripe, siSupabase, siVercel } from 'simple-icons';
import { z } from 'zod/v4';
import { SourceLogo } from '../terminal/SourceLogo';

// Local CC0 Simple Icons artwork. Marks belong to their owners.
const resources = {
  nextjs: { label: 'Next.js', origin: 'nextjs.org', mark: siNextdotjs },
  supabase: { label: 'Supabase', origin: 'supabase.com', mark: siSupabase },
  stripe: { label: 'Stripe', origin: 'stripe.com', mark: siStripe },
  postgresql: { label: 'PostgreSQL', origin: 'www.postgresql.org', mark: siPostgresql },
  react: { label: 'React', origin: 'react.dev', mark: siReact },
  vercel: { label: 'Vercel', origin: 'vercel.com', mark: siVercel },
  github: { label: 'GitHub', origin: 'github.com', mark: siGithub },
  cloudflare: { label: 'Cloudflare', origin: 'www.cloudflare.com', mark: siCloudflare },
};
const resourceKey = z.enum(['nextjs', 'supabase', 'stripe', 'postgresql', 'react', 'vercel', 'github', 'cloudflare']);

function ResourceMark({ origin, research = false }: { origin: string; research?: boolean }) {
  const hostname = origin.replace(/^www[.]/, '');
  const resource = Object.values(resources).find(item => {
    const domain = item.origin.replace(/^www[.]/, '');
    return hostname === domain || hostname.endsWith('.' + domain);
  });
  return resource
    ? <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d={resource.mark.path} /></svg>
    : research ? <SourceLogo domain={hostname} size={15} /> : <Globe size={15} aria-hidden="true" />;
}

export function EvidenceChip({ href, title, siteName }: { href: string; title: string; siteName?: string }) {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  const domain = url.hostname.replace(/^www\./i, '');
  return <a className="native-evidence-chip" href={url.href} target="_blank" rel="noopener noreferrer" title={title} aria-label={`${title} (${domain})`}>
    <ResourceMark origin={domain} research /><span>{siteName || domain}</span><ArrowUpRight size={13} aria-hidden="true" />
  </a>;
}

export const Resource = defineComponent({
  name: 'Resource',
  props: z.object({ key: resourceKey, role: z.string().min(1).max(180) }),
  description: 'An official product link and a concise explanation of its role. Use only for a product relevant to the user. This link is a reference, not retrieved evidence.',
  component: ({ props }) => {
    const { label, origin } = resources[props.key];
    return <div className="native-resource">
      <ResourceMark origin={origin} />
      <div>
        <a href={'https://' + origin} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={13} aria-hidden="true" /></a>
        <p>{props.role}</p>
      </div>
    </div>;
  },
});
