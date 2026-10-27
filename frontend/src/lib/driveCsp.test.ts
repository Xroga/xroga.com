import assert from 'node:assert/strict';
import { test } from 'node:test';

const DRIVE_ORIGIN = 'https://xroga-drive-prod.f14d36fd540c59ad410272122edc1a7e.r2.cloudflarestorage.com';

/** Loads the real Next config with the given Drive switch and returns its connect-src directive. */
async function connectSrc(driveFlag: string | undefined): Promise<string> {
  const saved = { api: process.env.NEXT_PUBLIC_API_URL, drive: process.env.NEXT_PUBLIC_XROGA_DRIVE };
  process.env.NEXT_PUBLIC_API_URL = 'https://api.xroga.com';
  if (driveFlag === undefined) delete process.env.NEXT_PUBLIC_XROGA_DRIVE; else process.env.NEXT_PUBLIC_XROGA_DRIVE = driveFlag;
  try {
    const mod = await import(`../../next.config.mjs?drive=${String(driveFlag)}-${Math.random()}`);
    const headers = await mod.default.headers();
    const csp = headers.flatMap((h: { headers: { key: string; value: string }[] }) => h.headers).find((h: { key: string }) => h.key === 'Content-Security-Policy');
    assert.ok(csp, 'a Content-Security-Policy header is configured');
    const directive = /connect-src[^;]*/.exec(csp.value);
    assert.ok(directive, 'connect-src is present');
    return directive[0];
  } finally {
    if (saved.api === undefined) delete process.env.NEXT_PUBLIC_API_URL; else process.env.NEXT_PUBLIC_API_URL = saved.api;
    if (saved.drive === undefined) delete process.env.NEXT_PUBLIC_XROGA_DRIVE; else process.env.NEXT_PUBLIC_XROGA_DRIVE = saved.drive;
  }
}

test('with the Drive screen on, the browser may upload to exactly the private Drive bucket', async () => {
  const src = await connectSrc('1');
  assert.ok(src.split(' ').includes(DRIVE_ORIGIN));
});

test('the Drive bucket origin is never a wildcard and is absent when Drive is off', async () => {
  for (const flag of [undefined, '', '0']) {
    const src = await connectSrc(flag);
    assert.ok(!src.includes('r2.cloudflarestorage.com'), `flag ${String(flag)} must not open the storage origin`);
  }
  const on = await connectSrc('1');
  assert.ok(!/\*\.r2\.cloudflarestorage\.com/.test(on) && !/https:\/\/\*/.test(on.replace(/https:\/\/\*\.(supabase|google-analytics|analytics\.google|clarity)\./g, '')));
});

test('the existing connection allowances are unchanged', async () => {
  const src = await connectSrc('1');
  for (const origin of ['https://api.xroga.com', 'wss://api.xroga.com', 'https://*.supabase.co', 'https://api.github.com', 'https://api.vercel.com']) {
    assert.ok(src.split(' ').includes(origin), `${origin} stays allowed`);
  }
});
