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
  { names: ['PayPal'], url: 'https://paypal.com' },
  { names: ['Google Cloud'], url: 'https://cloud.google.com' },
] as const;

/** Structured identities and authored links never certify source retrieval.
 * Explicit links retain their destination. Conflicting identity metadata must
 * not attach an official brand to an unrelated destination or label. */
export function resourceIdentityV2(label: string, url?: string, entityId?: string) {
  const byLabel = leadingEntityV2(label);
  const explicit = entityId ? entities.find(entity => entity.names.some(name => name.toLowerCase() === entityId.toLowerCase())) : undefined;
  const selected = explicit ? { name: explicit.names[0], url: explicit.url } : !entityId ? byLabel : undefined;
  if (!selected || !byLabel || new URL(selected.url).hostname !== new URL(byLabel.url).hostname) return undefined;
  if (url) {
    try {
      const supplied = new URL(url);
      const host = supplied.hostname.replace(/^www\./, '');
      const official = new URL(selected.url).hostname;
      if (supplied.protocol !== 'https:' || supplied.username || supplied.password || (host !== official && !host.endsWith('.' + official))) return undefined;
    } catch { return undefined; }
  }
  return { ...selected, markUrl: selected.url, url: url ?? selected.url };
}

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

/** A model-authored bold resource label is a role, even without list syntax. */
export function authoredEntityParagraphV2(node: EntitySyntaxV2) {
  const first = node.type === 'paragraph' ? node.children?.[0] : undefined;
  const text = first?.type === 'strong' && first.children?.length === 1 ? first.children[0] : undefined;
  return text?.type === 'text' ? leadingEntityV2(text.value ?? '') : undefined;
}

/** Enrich explicit leading resource labels only, never ordinary prose, code,
 * citations, existing links, or untrusted URLs. Original text is unchanged. */
export function remarkEntityRolesV2() {
  return (root: EntitySyntaxV2) => {
    const visit = (node: EntitySyntaxV2, parentType?: string) => {
      const paragraphEntity = parentType === 'root' ? authoredEntityParagraphV2(node) : undefined;
      if (paragraphEntity) {
        const children = node.children![0].children!;
        const original = children[0].value!;
        children.splice(0, 1,
          { type: 'link', url: paragraphEntity.url, children: [{ type: 'text', value: paragraphEntity.name }] },
          { type: 'text', value: original.slice(paragraphEntity.name.length) });
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-resource-v2': 'true' } };
      }
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
      node.children?.forEach(child => visit(child, node.type));
    };
    visit(root);
  };
}
