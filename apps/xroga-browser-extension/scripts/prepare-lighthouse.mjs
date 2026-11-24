// Prepares public/lighthouse/bundle.js from chrome-devtools-mcp's ready-made Lighthouse bundle (Apache-2.0, github.com/ChromeDevTools/chrome-devtools-mcp, src/third_party/lighthouse-devtools-mcp-bundle.js).
// The bundle is built for Node and names six Node modules. They are pointed at the browser stand-ins in public/lighthouse/shims by rewriting those import specifiers and nothing else:
// the bundle must reach the browser byte for byte otherwise, because Lighthouse inspects its own function text and fails when a bundler rewrites it.
// Usage: node scripts/prepare-lighthouse.mjs <path to lighthouse-devtools-mcp-bundle.js>
import fs from 'node:fs';

const source = fs.readFileSync(process.argv[2], 'utf8');
const map = { path: 'path', events: 'events', process: 'process', fs: 'empty', zlib: 'empty', stream: 'empty' };
let count = 0;
const out = source.replace(/(\bfrom\s*)"(path|events|process|fs|zlib|stream)"/g, (_all, from, name) => {
  count++;
  return `${from}"./shims/${map[name]}.js"`;
});
const left = out.match(/\bfrom\s*"(?:path|events|process|fs|zlib|stream)"/g);
if (left) throw new Error(`unrewritten imports remain: ${left.length}`);
fs.mkdirSync(new URL('../public/lighthouse/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../public/lighthouse/bundle.js', import.meta.url), out);
console.log(`rewrote ${count} import specifiers; wrote ${(out.length / 1048576).toFixed(2)} MB`);
