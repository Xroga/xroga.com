import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const entry = require.resolve('lucide-react/dynamicIconImports.mjs');
const installed = JSON.parse(readFileSync(join(dirname(entry), 'package.json'), 'utf8'));
assert.equal(installed.license, 'ISC');
const { default: imports } = await import(pathToFileURL(entry).href);
const directory = new URL('../frontend/public/native-icons/', import.meta.url);
const catalog = new URL('../frontend/src/components/native-openui/upstream/components/lucide-catalog.json', import.meta.url);
const names = Object.keys(imports).sort();
const count = 24;
const groups = Array.from({ length: count }, () => []);
const index = {};
const elements = new Set(['path','circle','ellipse','rect','line','polyline','polygon']);
const attrs = new Set(['d','cx','cy','r','rx','ry','x','y','x1','y1','x2','y2','width','height','points','fill','stroke','strokeWidth','opacity','transform','strokeLinecap','strokeLinejoin','strokeDasharray']);
const svgAttribute = name => name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[char]));

const resolved = await Promise.all(names.map(name => imports[name]()));
for (const [i, name] of names.entries()) {
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const shard = Math.floor(i * count / names.length);
  index[name] = shard;
  const { __iconNode: nodes } = resolved[i];
  assert.ok(Array.isArray(nodes) && nodes.length > 0);
  const markup = nodes.map(([tag, props]) => {
    assert.ok(elements.has(tag), 'Unexpected Lucide SVG element: ' + tag);
    const fields = Object.entries(props).filter(([key]) => key !== 'key').map(([key, value]) => {
      assert.ok(attrs.has(key), 'Unexpected Lucide SVG attribute: ' + key);
      assert.ok(!/url\s*\(/i.test(String(value)) && ['string', 'number'].includes(typeof value));
      return svgAttribute(key) + '="' + xml(value) + '"';
    });
    return '<' + tag + ' ' + fields.join(' ') + '/>';
  }).join('');
  groups[shard].push('<symbol id="' + name + '" viewBox="0 0 24 24">' + markup + '</symbol>');
}

const check = process.argv.includes('--check');
const save = (path, contents) => {
  if (check) assert.equal(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), contents, path.href);
  else writeFileSync(path, contents);
};
if (!check) mkdirSync(directory, { recursive: true });
const prefix = 'lucide-' + installed.version + '-';
for (const [shard, symbols] of groups.entries()) {
  const text = '<svg xmlns="http://www.w3.org/2000/svg">\n' + symbols.join('\n') + '\n</svg>\n';
  save(new URL(prefix + shard + '.svg', directory), text);
}
save(new URL('LICENSE', directory), readFileSync(join(dirname(entry), 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'));
save(catalog, JSON.stringify({ version: installed.version, license: installed.license, names: index }) + '\n');
assert.equal(readdirSync(directory).filter(file => file.endsWith('.svg')).length, count, 'Unexpected stale icon sprite');
assert.ok(existsSync(catalog));
console.log(JSON.stringify({ version: installed.version, icons: names.length, sprites: count, checked: check }));
