import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { accountDisplayName } from '../components/integrations/ConnectedAccounts';

const root = resolve(process.cwd(), process.cwd().endsWith('frontend') ? '..' : '.');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('an account is shown by the user\'s own name, then the provider label, then a number', () => {
  assert.equal(accountDisplayName({ id: 'ca_a', alias: 'work-gmail', label: 'gmail_red-castle' }, 0), 'work-gmail');
  assert.equal(accountDisplayName({ id: 'ca_a', alias: null, label: 'gmail_red-castle' }, 0), 'gmail_red-castle');
  assert.equal(accountDisplayName({ id: 'ca_a', alias: null, label: null }, 1), 'Account 2');
});

test('the client calls exactly the routes the backend serves', () => {
  const client = read('frontend/src/lib/xrogaConnect.ts');
  const routes = read('backend/src/routes/composioAccountsRoutes.ts');
  assert.match(routes, /composioAccountsRouter\.get\('\/'/);
  assert.match(routes, /composioAccountsRouter\.put\('\/default'/);
  assert.match(routes, /composioAccountsRouter\.patch\('\/:accountId'/);
  assert.match(client, /xroga-connect\/accounts\?toolkit=/);
  assert.match(client, /xroga-connect\/accounts\/default['`]?,\s*\n?\s*\{ method: 'PUT'/);
  assert.match(client, /xroga-connect\/accounts\/\$\{encodeURIComponent\(accountId\)\}`,\s*\n?\s*\{ method: 'PATCH'/);
  assert.match(read('backend/src/routes/integrations.ts'), /router\.use\('\/xroga-connect\/accounts', composioAccountsRouter\)/);
});

test('the accounts panel appears only when Xroga enabled several accounts, and offers no credential field', () => {
  const component = read('frontend/src/components/integrations/ConnectedAccounts.tsx');
  assert.match(component, /if \(!state\?\.multiAccount\) return null;/);
  assert.ok(!/type="password"|api[_-]?key|access[_-]?token/i.test(component));
  const detail = read('frontend/src/components/integrations/PluginDetail.tsx');
  assert.match(detail, /<ConnectedAccounts/);
  assert.match(detail, /composioConnected && \(connectionToolkit\?\.toolkit \|\| catalog\?\.slug\)/);
});

test('connecting another account opens the authorization window from the click and never reuses the already-connected shortcut', () => {
  const component = read('frontend/src/components/integrations/ConnectedAccounts.tsx');
  assert.ok(component.indexOf("window.open('', 'xroga-connect-oauth'") < component.indexOf('await getSessionId()'), 'the popup opens before any await so browsers allow it');
  assert.match(component, /xrogaConnect\.link\(sessionId, toolkit, alias \|\| undefined\)/);
});
