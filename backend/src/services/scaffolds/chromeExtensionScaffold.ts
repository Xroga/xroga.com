import type { ProjectFile } from '../integrations/githubDeploy.js';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'xroga-extension'
  );
}

const ZIP_SCRIPT = `import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';

async function walk(dir, base = dir, out = []) {
  for (const name of await readdir(dir)) {
    if (['node_modules', 'dist', '.git', 'scripts'].includes(name)) continue;
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) await walk(p, base, out);
    else out.push({ abs: p, rel: relative(base, p).replace(/\\\\/g, '/') });
  }
  return out;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : (c >>> 1);
  }
  return (~c) >>> 0;
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }

const root = process.cwd();
const files = (await walk(root)).filter((f) =>
  !f.rel.endsWith('.md') && f.rel !== 'package.json' && f.rel !== 'index.html' && !f.rel.startsWith('dist/')
);

const localParts = [];
const centralParts = [];
let offset = 0;

for (const f of files) {
  const data = await readFile(f.abs);
  const nameBuf = Buffer.from(f.rel, 'utf8');
  const compressed = deflateRawSync(data);
  const crc = crc32(data);
  const localHeader = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    u16(20), u16(0), u16(8), u16(0), u16(0),
    u32(crc), u32(compressed.length), u32(data.length),
    u16(nameBuf.length), u16(0), nameBuf, compressed,
  ]);
  localParts.push(localHeader);
  const central = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x01, 0x02]),
    u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
    u32(crc), u32(compressed.length), u32(data.length),
    u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0),
    u32(0), u32(offset), nameBuf,
  ]);
  centralParts.push(central);
  offset += localHeader.length;
}

const centralDir = Buffer.concat(centralParts);
const end = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  u16(0), u16(0), u16(files.length), u16(files.length),
  u32(centralDir.length), u32(offset), u16(0),
]);

await mkdir(join(root, 'dist'), { recursive: true });
const outPath = join(root, 'dist', 'extension.zip');
const stream = createWriteStream(outPath);
for (const p of localParts) stream.write(p);
stream.write(centralDir);
stream.write(end);
stream.end();
console.log('Wrote', outPath);
`;

/**
 * Chrome Manifest V3 extension scaffold.
 * Pushes to GitHub; packages zip for sideload / manual Chrome Web Store upload (user pays ~$5 CWS).
 * Not a finished CWS listing — Xroga does not publish to the store.
 */
export function buildChromeExtensionScaffold(opts: {
  projectName: string;
  userPrompt?: string;
}): ProjectFile[] {
  const name = opts.projectName.trim() || 'Xroga Extension';
  const slug = slugify(name);
  const promptNote = opts.userPrompt ? opts.userPrompt.slice(0, 400) : 'Chrome extension';

  return [
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: slug,
          version: '1.0.0',
          private: true,
          description: `${name} — Chrome MV3 extension scaffolded by Xroga`,
          scripts: {
            zip: 'node scripts/zip-extension.mjs',
            build: 'npm run zip',
          },
        },
        null,
        2,
      ),
    },
    {
      path: 'manifest.json',
      content: JSON.stringify(
        {
          manifest_version: 3,
          name,
          version: '1.0.0',
          description: promptNote,
          action: {
            default_popup: 'popup.html',
            default_title: name,
          },
          background: {
            service_worker: 'background.js',
            type: 'module',
          },
          permissions: ['storage', 'activeTab'],
          host_permissions: [],
        },
        null,
        2,
      ),
    },
    {
      path: 'background.js',
      content: `/* Xroga MV3 service worker */
chrome.runtime.onInstalled.addListener(() => {
  console.log('${name} installed');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ping') {
    sendResponse({ ok: true, from: 'background' });
    return true;
  }
  return false;
});
`,
    },
    {
      path: 'popup.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${name}</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <main>
      <h1>${name}</h1>
      <p>Scaffolded by Xroga. Edit popup.js to add features.</p>
      <button id="ping" type="button">Ping worker</button>
      <pre id="out"></pre>
    </main>
    <script src="popup.js" type="module"></script>
  </body>
</html>
`,
    },
    {
      path: 'popup.css',
      content: `body {
  margin: 0;
  font-family: system-ui, sans-serif;
  min-width: 260px;
  background: #0b1220;
  color: #e8eefc;
}
main { padding: 14px; }
h1 { font-size: 15px; margin: 0 0 8px; }
p { font-size: 12px; opacity: 0.75; margin: 0 0 12px; }
button {
  border: 0;
  border-radius: 8px;
  padding: 8px 12px;
  background: #3b82f6;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
pre { font-size: 11px; margin-top: 10px; white-space: pre-wrap; }
`,
    },
    {
      path: 'popup.js',
      content: `const out = document.getElementById('out');
document.getElementById('ping')?.addEventListener('click', async () => {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'ping' });
    out.textContent = JSON.stringify(res, null, 2);
  } catch (err) {
    out.textContent = String(err);
  }
});
`,
    },
    {
      path: 'content.js',
      content: `/* Optional content script — enable in manifest.json when needed */
console.log('${name} content script loaded');
`,
    },
    { path: 'scripts/zip-extension.mjs', content: ZIP_SCRIPT },
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name} — Chrome extension</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #070b14; color: #e8eefc; margin: 0; padding: 2rem; }
      main { max-width: 40rem; margin: 0 auto; }
      h1 { font-size: 1.6rem; }
      code { background: #121a2b; padding: 0.15rem 0.4rem; border-radius: 4px; }
      .card { border: 1px solid #243044; border-radius: 12px; padding: 1rem 1.1rem; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${name}</h1>
      <p>Chrome MV3 extension scaffolded by <strong>Xroga</strong>. This page is a web preview — load the extension from the repo.</p>
      <div class="card">
        <p><strong>Sideload (free):</strong> chrome://extensions → Developer mode → Load unpacked → this folder.</p>
        <p><strong>Zip:</strong> <code>npm run zip</code> then upload to Chrome Web Store (~$5 one-time on your developer account).</p>
      </div>
    </main>
  </body>
</html>
`,
    },
    {
      path: 'PUBLISH.md',
      content: `# Publish ${name} (Chrome extension)

## Free path — sideload
1. Open \`chrome://extensions\`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo folder
4. Iterate in Workspace; follow-ups patch the same sticky GitHub repo

## Chrome Web Store (user-paid, ~$5 one-time)
1. Download \`extension.zip\` from the GitHub Release Xroga creates after ship (or run \`npm run zip\` locally)
2. Create a [Chrome Web Store developer](https://chrome.google.com/webstore/devconsole) account (you pay the one-time fee)
3. Upload the zip, fill listing, submit for review

Xroga does **not** pay CWS fees and does not publish on your behalf — it scaffolds + pushes GitHub + attaches \`extension.zip\` on a GitHub Release for download.
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Chrome Manifest V3 extension scaffolded by **Xroga AI**.

## Prompt
${promptNote}

## Develop
- Load unpacked in Chrome (see \`PUBLISH.md\`)
- Edit \`popup.*\`, \`background.js\`, optional \`content.js\`
- Push stays on your sticky GitHub repo

## Ship
See \`PUBLISH.md\` for sideload (free) and Chrome Web Store (~$5 on your account).
`,
    },
  ];
}
