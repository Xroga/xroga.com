import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectScaffoldKind } from './detectScaffold.js';
import { buildExpoScaffold } from './expoScaffold.js';
import { buildNextjsScaffold } from './nextjsScaffold.js';
import {
  buildScaffoldForPrompt,
  mergeScaffoldWithGenerated,
} from '../projectScaffold.js';

describe('detectScaffoldKind', () => {
  it('picks expo for android/ios prompts', () => {
    assert.equal(detectScaffoldKind('Build an Android and iOS fitness app'), 'expo');
    assert.equal(detectScaffoldKind('Create an Expo mobile app for recipes'), 'expo');
  });

  it('picks nextjs for auth/saas/api prompts', () => {
    assert.equal(detectScaffoldKind('Build a SaaS dashboard with auth and Stripe'), 'nextjs');
    assert.equal(detectScaffoldKind('Next.js app with Supabase login'), 'nextjs');
  });

  it('defaults to static for simple sites', () => {
    assert.equal(detectScaffoldKind('Build a simple landing page for a cafe'), 'static');
  });
});

describe('scaffolds', () => {
  it('nextjs scaffold includes API + auth that read env', () => {
    const files = buildNextjsScaffold({ projectName: 'Acme SaaS', userPrompt: 'saas with auth' });
    const paths = new Set(files.map((f) => f.path));
    assert.ok(paths.has('package.json'));
    assert.ok(paths.has('app/api/chat/route.ts'));
    assert.ok(paths.has('app/api/health/route.ts'));
    assert.ok(paths.has('lib/supabase/server.ts'));
    assert.ok(paths.has('middleware.ts'));
    assert.ok(paths.has('app/auth/sign-out/route.ts'));
    assert.ok(paths.has('supabase/migrations/001_initial.sql'));
    assert.ok(paths.has('supabase/README.md'));
    assert.ok(paths.has('.env.example'));
    const chat = files.find((f) => f.path === 'app/api/chat/route.ts')!.content;
    assert.match(chat, /OPENAI_API_KEY|OPENROUTER_API_KEY/);
    assert.doesNotMatch(chat, /sk-[a-zA-Z0-9]{10,}/);
    const sql = files.find((f) => f.path === 'supabase/migrations/001_initial.sql')!.content;
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /auth\.uid\(\)/);
    assert.match(sql, /profiles\.plan|stripe_customer/i);
    const env = files.find((f) => f.path === '.env.example')!.content;
    assert.match(env, /NEXT_PUBLIC_SUPABASE_URL/);
    const server = files.find((f) => f.path === 'lib/supabase/server.ts')!.content;
    assert.match(server, /@supabase\/ssr/);
  });

  it('nextjs scaffold adds storage policies when prompt mentions uploads', () => {
    const files = buildNextjsScaffold({
      projectName: 'Media App',
      userPrompt: 'app with image upload and avatar storage',
    });
    const sql = files.find((f) => f.path === 'supabase/migrations/001_initial.sql')!.content;
    assert.match(sql, /storage\.buckets/);
    assert.match(sql, /storage\.objects/);
  });

  it('expo scaffold includes android/ios config', () => {
    const files = buildExpoScaffold({ projectName: 'FitTrack', userPrompt: 'android ios app' });
    const paths = new Set(files.map((f) => f.path));
    assert.ok(paths.has('app.json'));
    assert.ok(paths.has('eas.json'));
    assert.ok(paths.has('PUBLISH.md'));
    assert.ok(paths.has('.eas/workflows/publish-android.yml'));
    assert.ok(paths.has('.eas/workflows/publish-ios.yml'));
    assert.ok(paths.has('app/index.tsx'));
    assert.ok(paths.has('package.json'));
    const appJson = files.find((f) => f.path === 'app.json')!.content;
    assert.match(appJson, /"ios"/);
    assert.match(appJson, /"android"/);
    assert.match(appJson, /projectId/);
    const publish = files.find((f) => f.path === 'PUBLISH.md')!.content;
    assert.match(publish, /non-developer path/i);
    assert.match(publish, /Publish to Google Play/i);
  });

  it('merge prefers non-empty AI files over scaffold', () => {
    const { files: scaffold } = buildScaffoldForPrompt({
      prompt: 'Build a SaaS with auth',
      projectName: 'Demo',
    });
    const merged = mergeScaffoldWithGenerated(scaffold, [
      { path: 'app/page.tsx', content: 'export default function Page(){return <h1>Custom</h1>}' },
    ]);
    const page = merged.find((f) => f.path === 'app/page.tsx')!.content;
    assert.match(page, /Custom/);
    assert.ok(merged.some((f) => f.path === 'app/api/health/route.ts'));
  });
});
