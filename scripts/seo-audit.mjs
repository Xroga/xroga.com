const base = (process.env.SEO_AUDIT_BASE_URL || process.argv.find((value) => value.startsWith('--base='))?.slice(7) || 'http://localhost:3000').replace(/\/$/, '');
const publicPaths = ['/', '/features', '/ai-coding-agent', '/ai-app-builder', '/ai-website-builder', '/build-saas-with-ai', '/github-ai-coding-agent', '/vercel-ai-deployment', '/community', '/docs', '/docs/getting-started', '/docs/security', '/crypto-hackathon-builder', '/research/web3-hackathon-winning-patterns', '/pricing', '/about'];
const privatePaths = ['/workspace', '/dashboard', '/settings', '/admin/community', '/auth/login'];
const problems = [];
const titleMap = new Map();
const canonicalMap = new Map();

function match(html, expression) { return html.match(expression)?.[1]?.trim() || ''; }
function visibleText(value) { return value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

for (const path of publicPaths) {
  let response;
  try { response = await fetch(`${base}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(15_000) }); }
  catch (error) { problems.push(`${path}: request failed (${error instanceof Error ? error.message : 'network error'})`); continue; }
  const html = await response.text();
  if (!response.ok) problems.push(`${path}: HTTP ${response.status}`);
  const title = match(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = match(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || match(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const canonical = match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || match(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const h1Count = (html.match(/<h1(?:\s|>)/gi) || []).length;
  if (!title || title.length < 20 || title.length > 70) problems.push(`${path}: title missing or outside 20–70 characters`);
  if (!description || description.length < 70 || description.length > 180) problems.push(`${path}: description missing or outside 70–180 characters`);
  if (!canonical || !canonical.startsWith('https://xroga.com')) problems.push(`${path}: canonical missing or non-production`);
  if (h1Count !== 1) problems.push(`${path}: expected one H1, found ${h1Count}`);
  if (/name=["']robots["'][^>]+noindex/i.test(html)) problems.push(`${path}: public route is noindex`);
  if (visibleText(html).length < 180) problems.push(`${path}: insufficient server-rendered text`);
  if (titleMap.has(title)) problems.push(`${path}: duplicate title also used by ${titleMap.get(title)}`); else titleMap.set(title, path);
  if (canonicalMap.has(canonical)) problems.push(`${path}: duplicate canonical also used by ${canonicalMap.get(canonical)}`); else canonicalMap.set(canonical, path);
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(block[1]); } catch { problems.push(`${path}: invalid JSON-LD`); }
  }
  for (const image of html.matchAll(/<img\b([^>]*)>/gi)) if (!/\balt=["'][^"']*["']/i.test(image[1])) problems.push(`${path}: image missing alt attribute`);
}

for (const path of privatePaths) {
  try {
    const response = await fetch(`${base}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    const html = await response.text();
    if (!/name=["']robots["'][^>]+noindex/i.test(html) && !/content=["'][^"']*noindex/i.test(html)) problems.push(`${path}: private/auth route does not emit noindex`);
  } catch (error) { problems.push(`${path}: private-route check failed (${error instanceof Error ? error.message : 'network error'})`); }
}

const discoveryFiles = [
  { path: '/robots.txt', contentType: 'text/plain', required: /Sitemap:\s*https:\/\/xroga\.com\/sitemap\.xml/i },
  { path: '/sitemap.xml', contentType: 'application/xml', required: /<urlset\b/i },
  { path: '/llms.txt', contentType: 'text/plain', required: /# Xroga AI/i },
];
for (const { path, contentType, required } of discoveryFiles) {
  try {
    const response = await fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const body = await response.text();
    if (!response.ok) problems.push(`${path}: HTTP ${response.status}`);
    if (response.status >= 300 && response.status < 400) problems.push(`${path}: redirects to ${response.headers.get('location') || 'an unknown location'}`);
    if (!response.headers.get('content-type')?.toLowerCase().includes(contentType)) problems.push(`${path}: expected ${contentType} response`);
    if (!required.test(body)) problems.push(`${path}: expected discovery content is missing`);
  }
  catch { problems.push(`${path}: unavailable`); }
}

if (problems.length) { console.error(`SEO audit failed with ${problems.length} issue(s):\n${problems.map((problem) => `- ${problem}`).join('\n')}`); process.exit(1); }
console.log(`SEO audit passed: ${publicPaths.length} public routes, ${privatePaths.length} private routes, and 3 discovery files.`);
