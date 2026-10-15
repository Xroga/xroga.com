import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeAudit } from './dependency-advisories.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);

test('advisory evidence keeps critical paths and unresolved fixes without marking them passing', () => {
  const result = summarizeAudit({auditReportVersion:2,metadata:{vulnerabilities:{critical:1}},vulnerabilities:{fixture:{severity:'critical',isDirect:false,range:'<2',nodes:['node_modules/fixture'],via:[{title:'Synthetic advisory',url:'https://example.invalid/advisory',severity:'critical',range:'<2'}],effects:['consumer'],fixAvailable:false}}}, {packages:{'node_modules/fixture':{version:'1.0.0'}}});
  assert.equal(result.findings[0].installed[0].version,'1.0.0');
  assert.equal(result.findings[0].fixAvailable,false);
  assert.equal(result.findings[0].exposure,'REQUIRES_SEMANTIC_RUNTIME_REVIEW_NOT_WAIVED');
});
test('missing audit results fail closed rather than claiming zero vulnerabilities', () => {
  assert.throws(() => summarizeAudit({error:{code:'NETWORK'}},{packages:{}}));
});

test('all lock graphs retain same-major patched parser receivers', () => {
  const expected = { 'brace-expansion': new Set(['1.1.21','2.1.7','5.0.12']), 'js-yaml': new Set(['4.3.2']), 'source-map-js': new Set(['1.2.2']) };
  for (const file of ['../../package-lock.json','../../backend/package-lock.json','../../frontend/package-lock.json']) {
    const lock = JSON.parse(readFileSync(new URL(file, import.meta.url),'utf8'));
    for (const [path, pkg] of Object.entries(lock.packages)) {
      for (const [name, versions] of Object.entries(expected)) {
        if (path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`) assert.ok(versions.has(pkg.version), `${file}: ${path} ${pkg.version}`);
      }
    }
  }
});

test('actual ESLint YAML parser bounds empty merge sources while preserving ordinary config', () => {
  const eslint = createRequire(require.resolve('eslint/package.json'));
  const yaml = eslint('js-yaml');
  assert.equal(eslint('js-yaml/package.json').version,'4.3.2');
  assert.deepEqual(yaml.load('base: &base {enabled: true}\nconfig: {<<: *base}'),{base:{enabled:true},config:{enabled:true}});
  assert.throws(()=>yaml.load('arr: &arr [{},{},{},{}]\ntarget: {<<: *arr}',{maxTotalMergeKeys:2}),/maxTotalMergeKeys/);
});

test('actual PostCSS source-map receiver rejects unbounded and malformed section offsets', () => {
  const postcss = createRequire(require.resolve('postcss/package.json'));
  const {SourceMapConsumer} = postcss('source-map-js');
  assert.equal(postcss('source-map-js/package.json').version,'1.2.2');
  const section = (line,column=0) => ({version:3,sections:[{offset:{line,column},map:{version:3,sources:['a.js'],names:[],mappings:'AAAA'}}]});
  for (const offset of [-1,0.5,Infinity,Number.MAX_SAFE_INTEGER]) assert.throws(()=>new SourceMapConsumer(section(offset)),/Section offset/);
  assert.throws(()=>new SourceMapConsumer(section(0,-1)),/Section offset/);
  assert.equal(new SourceMapConsumer(section(0)).originalPositionFor({line:1,column:1}).source,'a.js');
});

test('actual minimatch receivers preserve glob behavior and bound deep brace expansion', async () => {
  const nodemon = createRequire(require.resolve('nodemon/package.json',{paths:[fileURLToPath(new URL('../../backend/',import.meta.url))]}));
  const receivers = [require.resolve('minimatch'),nodemon.resolve('minimatch')];
  for(const receiver of receivers){
    const resolver=createRequire(receiver);
    const loaded=await import(pathToFileURL(resolver.resolve('brace-expansion')).href);
    const expand=typeof loaded.default==='function'?loaded.default:loaded.expand;
    assert.deepEqual(expand('file-{a,b}.ts'),['file-a.ts','file-b.ts']);
    const input='{'.repeat(1500)+'a,b'+'}'.repeat(1500);
    const bounded=expand(input,{maxDepth:4,max:4,maxLength:10000});
    assert.ok(Array.isArray(bounded));assert.ok(bounded.length<=4);
    assert.ok(bounded.some(value=>value.includes('{')),'Depth-limited nested input is retained literally, not expanded without bound');
  }
});
