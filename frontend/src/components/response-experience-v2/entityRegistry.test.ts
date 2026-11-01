import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { leadingEntityV2, remarkEntityRolesV2, type EntitySyntaxV2 } from './entityRegistry';

test('entity navigation recognizes exact identities, never lookalike hosts or arbitrary brands', () => {
  assert.equal(leadingEntityV2('Supabase Auth:')?.url, 'https://supabase.com');
  assert.equal(leadingEntityV2('Next.js server')?.url, 'https://nextjs.org');
  for (const label of ['Stripe.evil.test', 'SupabaseFake', 'Unknown', 'Not Stripe']) assert.equal(leadingEntityV2(label), undefined);
});

test('authored role labels gain local identity links without changing prose or source claims', () => {
  const parser = unified().use(remarkParse);
  const root = parser.parse('- **Supabase Auth:** validates sessions.\n- **Stripe:** billing.\n- **Browser:** input.\n\nStripe is mentioned in prose.\n\n`Stripe`\n\n- [Stripe](https://example.com/other)') as EntitySyntaxV2;
  const text = (n: EntitySyntaxV2): string => n.value ?? n.children?.map(text).join('') ?? '';
  const before = text(root);
  remarkEntityRolesV2()(root);
  assert.equal(text(root), before);
  const links: string[] = [];
  const visit = (n: EntitySyntaxV2) => { if (n.type === 'link') links.push(n.url!); n.children?.forEach(visit); };
  visit(root);
  assert.deepEqual(links, ['https://supabase.com', 'https://stripe.com', 'https://example.com/other']);
  const once = JSON.stringify(root);
  remarkEntityRolesV2()(root);
  assert.equal(JSON.stringify(root), once);
});
