import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  findChecklist,
  requiredMissing,
  type ChecklistItem,
} from './publish/types';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('Publish readiness distinguishes required and optional setup', () => {
  const items: ChecklistItem[] = [
    { id: 'github', label: 'GitHub', done: false, required: true },
    { id: 'vercel', label: 'Vercel', done: true, required: true },
    { id: 'supabase', label: 'Supabase', done: false, required: false },
  ];

  assert.deepEqual(requiredMissing(items).map((item) => item.id), ['github']);
  assert.equal(findChecklist(items, 'supabase')?.required, false);
});

test('Step 3 keeps Publish canonical and persists target in the URL', () => {
  const page = source('frontend/src/app/(shell)/dashboard/publish/page.tsx');
  const workspace = source('frontend/src/components/publish/PublishWorkspace.tsx');

  assert.match(page, /w-full max-w-none/);
  assert.match(workspace, /searchParams\.get\('target'\)/);
  assert.match(workspace, /searchParams\.get\('tab'\)/);
  assert.match(workspace, /params\.set\('target', next\)/);
  assert.match(workspace, /WebPublishPanel/);
  assert.match(workspace, /ChromePublishPanel/);
  assert.match(workspace, /DesktopPublishPanel/);
  assert.match(workspace, /MobilePublishPanel/);
});

test('Step 3 uses progressive disclosure instead of exposing advanced credentials first', () => {
  const chrome = source('frontend/src/components/publish/ChromePublishPanel.tsx');
  const desktop = source('frontend/src/components/publish/DesktopPublishPanel.tsx');
  const mobile = source('frontend/src/components/publish/MobilePublishPanel.tsx');

  assert.match(chrome, /Chrome Web Store/);
  assert.match(chrome, /Advanced \/ manual refresh token/);
  assert.match(desktop, /Code signing & notarization/);
  assert.match(desktop, /macOS notarization/);
  assert.match(mobile, /Store submission/);
  assert.match(mobile, /Advanced · link by EAS project ID/);
  assert.match(mobile, /Legacy Apple app-specific password/);
});

test('Mobile build and store submission remain separate real backend operations', () => {
  const mobile = source('frontend/src/components/publish/MobilePublishPanel.tsx');

  assert.match(mobile, /submit: false/);
  assert.match(mobile, /submit: true/);
  assert.match(mobile, /Submit Android to Google Play/);
  assert.match(mobile, /Submit iOS to App Store/);
  assert.match(mobile, /Google controls review/);
  assert.match(mobile, /Apple controls review/);
});

test('Web Publish does not fake a direct deployment button', () => {
  const web = source('frontend/src/components/publish/WebPublishPanel.tsx');

  assert.match(web, /Publish from Workspace/);
  assert.match(web, /No verified web deployment shown yet/);
  assert.match(web, /project\.deployUrl/);
  assert.match(web, /CustomDomainPanel/);
});

test('managed Vercel is part of truthful Web readiness', () => {
  const backend = source('backend/src/services/publish/userOwnedPublish.ts');
  const web = source('frontend/src/components/publish/WebPublishPanel.tsx');

  assert.match(backend, /managedVercelAvailable = hasManagedVercelDeployment\(\)/);
  assert.match(backend, /githubConnected && \(vercelConnected \|\| managedVercelAvailable\)/);
  assert.match(web, /Xroga-managed publishing is available/);
  assert.match(web, /Your Vercel account/);
});

test('Step 3 preserves Plugins and links Developer Plugins to target-specific Publish views', () => {
  const pluginDetail = source('frontend/src/components/integrations/PluginDetail.tsx');

  assert.match(pluginDetail, /\/dashboard\/publish\?target=web/);
  assert.match(pluginDetail, /\/dashboard\/publish\?target=mobile/);
  assert.match(pluginDetail, /Open Publish/);
});

test('saved secret values are not rendered back into the Publish workspace', () => {
  const chrome = source('frontend/src/components/publish/ChromePublishPanel.tsx');
  const desktop = source('frontend/src/components/publish/DesktopPublishPanel.tsx');
  const mobile = source('frontend/src/components/publish/MobilePublishPanel.tsx');

  assert.match(chrome, /type="password"/);
  assert.match(desktop, /type="password"/);
  assert.match(mobile, /type="password"/);
  assert.doesNotMatch(chrome, /clientSecret\s*}\s*<\/p>/);
  assert.doesNotMatch(mobile, /applePrivateKey\s*}\s*<\/p>/);
});
