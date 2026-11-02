/** Reviewed navigation identities. These links identify products, they don't
 * assert that a source was retrieved or that the surrounding claim is verified. */
const entities = [
  { names: ['Next.js', 'NextJS'], url: 'https://nextjs.org' },
  { names: ['Supabase'], url: 'https://supabase.com' },
  { names: ['Stripe'], url: 'https://stripe.com' },
  { names: ['PostgreSQL', 'Postgres'], url: 'https://postgresql.org' },
  { names: ['React'], url: 'https://react.dev' },
  { names: ['TypeScript'], url: 'https://typescriptlang.org' },
  { names: ['Node.js'], url: 'https://nodejs.org' },
  { names: ['GitHub'], url: 'https://github.com' },
  { names: ['Cloudflare'], url: 'https://cloudflare.com' },
  { names: ['Vercel'], url: 'https://vercel.com' },
  { names: ['Docker'], url: 'https://docker.com' },
  { names: ['Python'], url: 'https://python.org' },
  { names: ['n8n'], url: 'https://n8n.io' },
  { names: ['Temporal'], url: 'https://temporal.io' },
  { names: ['Sentry'], url: 'https://sentry.io' },
  { names: ['PostHog'], url: 'https://posthog.com' },
] as const;

export function leadingEntityV2(label: string): { name: string; url: string } | undefined {
  for (const entity of entities) for (const name of entity.names) {
    if (label.slice(0, name.length).toLowerCase() !== name.toLowerCase()) continue;
    const next = label.slice(name.length, name.length + 1);
    // Avoid attaching official identities to lookalike domains or longer names.
    if (next && !/[\s:+\u2013\u2014]/u.test(next)) continue;
    return { name: label.slice(0, name.length), url: entity.url };
  }
}

export type EntitySyntaxV2 = { type: string; value?: string; url?: string; children?: EntitySyntaxV2[]; data?: { hProperties?: Record<string, unknown> } };

/** Enrich explicit leading resource labels only, never ordinary prose, code,
 * citations, existing links, or untrusted URLs. Original text is unchanged. */
export function remarkEntityRolesV2() {
  return (root: EntitySyntaxV2) => {
    const visit = (node: EntitySyntaxV2) => {
      if (node.type === 'heading') {
        const first = node.children?.[0];
        const text = first?.type === 'strong' ? first.children?.[0] : first?.type === 'text' ? first : undefined;
        const entity = text?.type === 'text' ? leadingEntityV2(text.value ?? '') : undefined;
        const children = first?.type === 'strong' ? first.children : node.children;
        if (entity && children) children.splice(0, 1,
          { type: 'link', url: entity.url, children: [{ type: 'text', value: entity.name }] },
          { type: 'text', value: text!.value!.slice(entity.name.length) });
      }
      if (node.type === 'listItem') {
        const paragraph = node.children?.[0];
        const first = paragraph?.type === 'paragraph' ? paragraph.children?.[0] : undefined;
        const text = first?.type === 'strong' ? first.children?.[0] : first?.type === 'text' ? first : undefined;
        const entity = text && text.type === 'text' && leadingEntityV2(text.value ?? '');
        const children = first?.type === 'strong' ? first.children : paragraph?.children;
        if (entity && children) {
          children.splice(0, 1,
            { type: 'link', url: entity.url, children: [{ type: 'text', value: entity.name }] },
            { type: 'text', value: text.value!.slice(entity.name.length) });
          node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-resource-v2': 'true' } };
        }
      }
      node.children?.forEach(visit);
    };
    visit(root);
  };
}
