'use client';

import { defineComponent } from '@openuidev/react-lang';
import { ArrowUpRight, Globe } from 'lucide-react';
import { siCloudflare, siGithub, siNextdotjs, siPostgresql, siReact, siStripe, siSupabase, siVercel } from 'simple-icons';
import { z } from 'zod/v4';

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

function Mark({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d={path} /></svg>;
}

const diagramResources = {
  'next.js (server)': resources.nextjs,
  'supabase auth': resources.supabase,
  'stripe billing': resources.stripe,
  'postgres + rls': resources.postgresql,
};

export function DiagramResourceMark({ label, fallback }: { label: string; fallback: React.ReactNode }) {
  const key = label.trim().toLowerCase();
  const resource = Object.values(resources).find(item => item.label.toLowerCase() === key)
    ?? (Object.hasOwn(diagramResources, key) ? diagramResources[key as keyof typeof diagramResources] : undefined);
  return resource ? <Mark path={resource.mark.path} /> : fallback;
}

function ResourceMark({ origin }: { origin: string }) {
  const hostname = origin.replace(/^www[.]/, '');
  const resource = Object.values(resources).find(item => {
    const domain = item.origin.replace(/^www[.]/, '');
    return hostname === domain || hostname.endsWith('.' + domain);
  });
  return resource
    ? <Mark path={resource.mark.path} />
    : <Globe size={15} aria-hidden="true" />;
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
