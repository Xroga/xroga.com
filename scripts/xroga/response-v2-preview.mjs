// Local synthetic renderer review only. No credentials, API or model calls.
// Run under scripts/local/local_maintenance.py so interruption cleanup is owned.
import { context } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
if (!process.env.XROGA_LOCAL_ARTIFACTS) throw new Error('Use the local maintenance runner');
const output = path.resolve(process.env.XROGA_LOCAL_ARTIFACTS, 'response-v2');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Xroga V2 local visual review</title><link rel="stylesheet" href="/review.css"><div id="root"></div><script src="/review.js"></script></html>');
const ctx = await context({ entryPoints: ['frontend/src/components/response-experience-v2/review/LocalReview.tsx'], outfile: path.join(output,'review.js'), bundle: true, jsx: 'automatic', tsconfig: 'frontend/tsconfig.json', define: { 'process.env.NODE_ENV': '"development"' }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' } });
await ctx.watch();
await ctx.serve({ host: '127.0.0.1', port: 3196, servedir: output });
console.log('Synthetic V2 review: http://127.0.0.1:3196');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await ctx.dispose(); process.exit(0); });
