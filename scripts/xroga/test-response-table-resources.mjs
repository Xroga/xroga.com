// Actual component rendering against captured model rows, with no API or inference.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const artifactRoot = process.env.XROGA_LOCAL_ARTIFACTS || (process.env.CI ? os.tmpdir() : undefined);
if (!artifactRoot) throw Error('Use the local maintenance runner');
await mkdir(artifactRoot, { recursive: true });
const owned = await mkdtemp(path.join(artifactRoot, 'table-resource-regression-'));
try {
  const outfile = path.join(owned, 'test.cjs');
  await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import assert from 'node:assert/strict';
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { DataTableV2 } from './frontend/src/components/response-experience-v2/DataV2';
    import captured from './frontend/src/components/response-experience-v2/testdata/captured-4c6319-role-table.json';
    const node = { ...captured.table, kind: 'table' };
    for (const stacked of [false, true]) {
      const before = JSON.stringify(node);
      const html = renderToStaticMarkup(<DataTableV2 node={node} stacked={stacked} />);
      assert.equal((html.match(/data-entity-verified="true"/g) || []).length, 6);
      for (const url of ['https://nextjs.org/', 'https://supabase.com/', 'https://stripe.com/']) assert.ok(html.includes('href="'+url+'"'));
      for (const row of node.rows) assert.ok(html.includes(row.c0));
      assert.equal(JSON.stringify(node), before, 'Rendering must not mutate received model data');
      const hostile = { ...node, rows: [
        {c0:'Stripe.evil.test',c1:'Unknown identity',c2:'No official mark'},
        {c0:'SupabaseFake',c1:'Unknown identity',c2:'No official mark'},
        {c0:'[Stripe](https://example.org/authored)',c1:'Explicit link',c2:'Keep authored destination'},
        {c0:'Ordinary concept',c1:'Supabase Auth is mentioned in descriptive prose.',c2:'No resource-row inference here'},
        {c0:'Next.js(App Router)',c1:'Application',c2:'Qualified resource name'},
      ] };
      const safe = renderToStaticMarkup(<DataTableV2 node={hostile} stacked={stacked} />);
      assert.equal((safe.match(/data-entity-verified="true"/g) || []).length, 1);
      assert.ok(safe.includes('href="https://example.org/authored"'));
      assert.ok(!safe.includes('href="https://stripe.com/"'));
      assert.ok(!safe.includes('href="https://supabase.com/"'));
    }
    console.log('PASS: captured role table and stacked layout, six authentic linked identities, exact row preservation, lookalike and authored-link controls. Zero API/model calls.');
  ` }, outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', tsconfig: 'frontend/tsconfig.json', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } });
  await import(pathToFileURL(outfile).href);
} finally {
  assert.ok(path.resolve(owned).startsWith(path.resolve(artifactRoot) + path.sep));
  await rm(owned, { recursive: true, force: true });
}
