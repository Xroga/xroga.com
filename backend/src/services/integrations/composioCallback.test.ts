import assert from 'node:assert/strict';
import test from 'node:test';
import { composioCallbackUrl } from './composioCallback.js';

const env = {
  FRONTEND_URL: 'https://xroga.com',
  XROGA_COMPOSIO_CALLBACK_ORIGINS: 'https://xrogaaicom-git-example-xrogas-projects.vercel.app',
};

test('OAuth returns to the exact approved frontend and keeps the toolkit for verification', () => {
  assert.equal(composioCallbackUrl({ toolkit: 'Canva', requestOrigin: 'https://xrogaaicom-git-example-xrogas-projects.vercel.app', env }),
    'https://xrogaaicom-git-example-xrogas-projects.vercel.app/dashboard/integrations/connect/callback?toolkit=canva');
  assert.equal(composioCallbackUrl({ toolkit: 'gmail', requestOrigin: 'https://xroga.com', env }),
    'https://xroga.com/dashboard/integrations/connect/callback?toolkit=gmail');
});

test('unlisted Vercel hosts and protocol tricks cannot redirect connected-account callbacks', () => {
  assert.throws(() => composioCallbackUrl({ toolkit: 'gmail', requestOrigin: 'https://attacker.vercel.app', env }), { code: 'COMPOSIO_CALLBACK_ORIGIN_FORBIDDEN' });
  assert.throws(() => composioCallbackUrl({ toolkit: 'gmail', requestOrigin: 'https://xroga.com.attacker.test', env }), { code: 'COMPOSIO_CALLBACK_ORIGIN_FORBIDDEN' });
  assert.throws(() => composioCallbackUrl({ toolkit: 'gmail', requestOrigin: 'https://xroga.com/path', env }), { code: 'COMPOSIO_CALLBACK_ORIGIN_FORBIDDEN' });
  assert.throws(() => composioCallbackUrl({ toolkit: 'gmail', requestOrigin: 'javascript:alert(1)', env }), { code: 'COMPOSIO_CALLBACK_ORIGIN_FORBIDDEN' });
});
