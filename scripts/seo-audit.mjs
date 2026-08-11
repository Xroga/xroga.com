import { readFile } from 'node:fs/promises';

const base = (process.env.SEO_AUDIT_BASE_URL || process.argv.find((value) => value.startsWith('--base='))?.slice(7) || 'http://localhost:3000').replace(/\/$/, '');
const contracts = JSON.parse(await readFile(new URL('./seo-contracts.json', import.meta.url), 'utf8'));
const problems = [];
const titleMap = new Map();
const canonicalMap = new Map();

function match(html, expression) { return html.match(expression)?.[1]?.trim() || ''; }
function decodeHtml(value) { return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>'); }
function visibleText(value) { return value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function collectTypes(value, output = new Set()) {
  if (Array.isArray(value)) for (const item of value) collectTypes(item, output);
  else if (value && typeof value === 'object') {
    const type = value['@type'];
    if (Array.isArray(type)) type.forEach((item) => output.add(item));
    else if (typeof type === 'string') output.add(type);
    Object.values(value).forEach((item) => collectTypes(item, output));
  }
  return output;
}
function collectIds(value, output = new Set()) {
  if (Array.isArray(value)) for (const item of value) collectIds(item, output);
  else if (value && typeof value === 'object') {
    if (typeof value['@id'] === 'string') output.add(value['@id']);
    Object.values(value).forEach((item) => collectIds(item, output));
  }
  return output;
}

for (const contract of contracts.publicRoutes) {
  const { path } = contract;
  let response;
  try { response = await fetch(`${base}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(15_000) }); }
  catch (error) { problems.push(`${path}: request failed (${error instanceof Error ? error.message : 'network error'})`); continue; }
  const html = await response.text();
  if (response.status !== (contract.status || 200)) problems.push(`${path}: HTTP ${response.status}`);
  const title = decodeHtml(match(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const description = match(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || match(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const canonical = match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || match(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const ogUrl = match(html, /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) || match(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
  const ogImage = match(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || match(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const h1Count = (html.match(/<h1(?:\s|>)/gi) || []).length;
  if (title !== contract.title) problems.push(`${path}: expected title "${contract.title}", found "${title}"`);
  if (!description || description.length < 70 || description.length > 180) problems.push(`${path}: description missing or outside 70–180 characters`);
  if (canonical !== contract.canonical) problems.push(`${path}: expected canonical ${contract.canonical}, found ${canonical || 'none'}`);
  if (ogUrl !== contract.canonical) problems.push(`${path}: og:url does not match canonical`);
  if (!ogImage.startsWith('https://xroga.com/')) problems.push(`${path}: og:image missing or non-absolute`);
  if (!/name=["']twitter:card["']/i.test(html)) problems.push(`${path}: twitter card metadata missing`);
  if (h1Count !== contract.h1Count) problems.push(`${path}: expected ${contract.h1Count} H1, found ${h1Count}`);
  if (/name=["']robots["'][^>]+noindex/i.test(html)) problems.push(`${path}: public route is noindex`);
  if (visibleText(html).length < 180) problems.push(`${path}: insufficient server-rendered text`);
  if (titleMap.has(title)) problems.push(`${path}: duplicate title also used by ${titleMap.get(title)}`); else titleMap.set(title, path);
  if (canonicalMap.has(canonical)) problems.push(`${path}: duplicate canonical also used by ${canonicalMap.get(canonical)}`); else canonicalMap.set(canonical, path);

  const schemaTypes = new Set();
  const schemaIds = new Set();
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(block[1]);
      collectTypes(data, schemaTypes);
      collectIds(data, schemaIds);
    } catch { problems.push(`${path}: invalid JSON-LD`); }
  }
  for (const type of contract.schemaTypes || []) if (!schemaTypes.has(type)) problems.push(`${path}: missing ${type} structured data`);
  for (const id of contract.schemaIds || []) if (!schemaIds.has(id)) problems.push(`${path}: missing structured-data ID ${id}`);
  for (const image of html.matchAll(/<img\b([^>]*)>/gi)) if (!/\balt=["'][^"']*["']/i.test(image[1])) problems.push(`${path}: image missing alt attribute`);
}

for (const path of contracts.privateRoutes) {
  try {
    const response = await fetch(`${base}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    const html = await response.text();
    if (!/name=["']robots["'][^>]+noindex/i.test(html) && !/content=["'][^"']*noindex/i.test(html)) problems.push(`${path}: private/auth route does not emit noindex`);
  } catch (error) { problems.push(`${path}: private-route check failed (${error instanceof Error ? error.message : 'network error'})`); }
}

for (const file of contracts.discoveryFiles) {
  try {
    const response = await fetch(`${base}${file.path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const body = await response.text();
    if (!response.ok) problems.push(`${file.path}: HTTP ${response.status}`);
    if (response.status >= 300 && response.status < 400) problems.push(`${file.path}: redirects to ${response.headers.get('location') || 'an unknown location'}`);
    if (!response.headers.get('content-type')?.toLowerCase().includes(file.contentType)) problems.push(`${file.path}: expected ${file.contentType} response`);
    if (file.includes && !body.includes(file.includes)) problems.push(`${file.path}: expected discovery content is missing`);
  } catch { problems.push(`${file.path}: unavailable`); }
}

if (problems.length) { console.error(`SEO audit failed with ${problems.length} issue(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`); process.exit(1); }
console.log(`SEO audit passed: ${contracts.publicRoutes.length} public routes, ${contracts.privateRoutes.length} private routes, and ${contracts.discoveryFiles.length} discovery files.`);
