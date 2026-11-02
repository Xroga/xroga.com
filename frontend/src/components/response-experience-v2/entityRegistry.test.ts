import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { leadingEntityV2, resourceIdentityV2, remarkEntityRolesV2, type EntitySyntaxV2 } from './entityRegistry';

test('typed role cards resolve the actual captured titles with authentic navigation', () => {
  for (const [title, url] of [
    ['Next.js app layer', 'https://nextjs.org'],
    ['Supabase Auth', 'https://supabase.com'],
    ['Supabase Postgres + RLS', 'https://supabase.com'],
    ['Supabase Storage', 'https://supabase.com'],
    ['Stripe Checkout / Billing', 'https://stripe.com'],
    ['Stripe webhooks', 'https://stripe.com'],
  ]) assert.equal(resourceIdentityV2(title)?.url, url);
  assert.equal(resourceIdentityV2('Stripe webhooks', undefined, 'stripe')?.url, 'https://stripe.com');
  assert.equal(resourceIdentityV2('Stripe webhooks', 'https://docs.stripe.com/webhooks', 'Stripe')?.url, 'https://docs.stripe.com/webhooks');
  for (const args of [
    ['Stripe.evil.test'], ['SupabaseFake'], ['Tenant A'],
    ['Supabase Auth', undefined, 'stripe'], ['Stripe', undefined, 'unverified'],
    ['Stripe', 'https://stripe.com.evil.test'], ['Stripe', 'https://example.com'],
    ['Stripe', 'javascript:alert(1)'], ['Stripe', 'https://user:password@stripe.com'],
  ] as Array<[string, string?, string?]>) assert.equal(resourceIdentityV2(...args), undefined);
});

test('generated bold role paragraphs receive identities without altering words or quoted content', () => {
  const source = '**Next.js** serves as the application server.\n\n**Supabase** provides PostgreSQL.\n\n**Stripe** handles billing.\n\n**Stripe.evil.test** is not an official identity.\n\n> **Stripe** is quoted.\n\n```md\n**Next.js** is code.\n```\n\n**[Stripe](https://example.com/context)** keeps its authored link.\n\nNext.js remains ordinary prose.';
  const root = unified().use(remarkParse).parse(source) as EntitySyntaxV2;
  const text = (n: EntitySyntaxV2): string => n.value ?? n.children?.map(text).join('') ?? '';
  const original = text(root), links: string[] = [];
  remarkEntityRolesV2()(root);
  const visit = (n: EntitySyntaxV2) => { if (n.type === 'link') links.push(n.url!); n.children?.forEach(visit); }; visit(root);
  assert.equal(text(root), original);
  assert.deepEqual(links, ['https://nextjs.org', 'https://supabase.com', 'https://stripe.com', 'https://example.com/context']);
  assert.equal(root.children?.filter(n => n.data?.hProperties?.['data-resource-v2'] === 'true').length, 3);
  const once = JSON.stringify(root); remarkEntityRolesV2()(root); assert.equal(JSON.stringify(root), once);
});

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

test('plain leading technology roles receive authentic navigation without rewriting text or linking lookalikes', () => {
  const root=unified().use(remarkParse).parse('- Next.js: application layer.\n- Supabase Auth handles identity.\n- Stripe.evil.test must stay unlinked.\n- `Stripe` is code.\n\nNext.js is prose.') as EntitySyntaxV2;
  const text=(n:EntitySyntaxV2):string=>n.value??n.children?.map(text).join('')??'';
  const before=text(root),links:string[]=[];
  remarkEntityRolesV2()(root);
  const visit=(n:EntitySyntaxV2)=>{if(n.type==='link')links.push(n.url!);n.children?.forEach(visit);};visit(root);
  assert.equal(text(root),before);
  assert.deepEqual(links,['https://nextjs.org','https://supabase.com']);
  const once=JSON.stringify(root);remarkEntityRolesV2()(root);assert.equal(JSON.stringify(root),once);
});

test('authored component headings receive authentic identities while code, existing links and lookalikes remain untouched', () => {
  const root = unified().use(remarkParse).parse('### Next.js Application Server\n\n### Supabase (Postgres + Auth)\n\n### Stripe.evil.test\n\n### [Stripe](https://example.com/context)\n\n`Next.js`') as EntitySyntaxV2;
  const text = (n: EntitySyntaxV2): string => n.value ?? n.children?.map(text).join('') ?? '';
  const before = text(root), links: string[] = [];
  remarkEntityRolesV2()(root);
  const visit = (n: EntitySyntaxV2) => { if (n.type === 'link') links.push(n.url!); n.children?.forEach(visit); }; visit(root);
  assert.equal(text(root), before);
  assert.deepEqual(links, ['https://nextjs.org', 'https://supabase.com', 'https://example.com/context']);
  const once = JSON.stringify(root); remarkEntityRolesV2()(root); assert.equal(JSON.stringify(root), once);
});
