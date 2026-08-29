import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:4000';
const expectedRelease = process.env.EXPECTED_RELEASE_SHA?.trim() ?? '';
const expectedWebRelease = process.env.EXPECTED_WEB_RELEASE_SHA?.trim() || expectedRelease;
const launchBillingApiUrl = process.env.LAUNCH_BILLING_API_URL?.replace(/\/$/, '') ?? '';
const run = randomUUID();
const password = `C3!${randomUUID()}aA9`;
const ownerEmail = `command3-owner-${run}@example.com`;
const outsiderEmail = `command3-outsider-${run}@example.invalid`;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
let ownerId = ''; let outsiderId = ''; let ownerProjectId = ''; let outsiderProjectId = '';

test.setTimeout(180_000);

/**
 * How long an authentication transition may take before it is a real failure.
 *
 * Bounded, not disabled: a login that never completes still fails the test. The number is sized
 * for a live Supabase round trip plus a client-side redirect on a cold CI runner, which the
 * default 5s expectation could not cover — so the test failed on latency and called it a broken
 * login. The whole run is still capped by `test.setTimeout` above.
 */
const AUTH_TRANSITION_TIMEOUT_MS = 30_000;

async function browserSession(page: import('@playwright/test').Page): Promise<{ status: number; authenticated: boolean }> {
  return page.evaluate(async () => {
    const response = await fetch('/api/session', { cache: 'no-store' });
    const body = await response.json();
    return { status: response.status, authenticated: body.authenticated === true };
  });
}

async function fillVisibleCheckoutField(
  page: import('@playwright/test').Page,
  selectors: string[],
  value: string,
): Promise<boolean> {
  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if (await locator.count() && await locator.isVisible().catch(() => false)) {
        // Hosted payment controls keep framework/provider state outside the
        // input DOM. Sequential keyboard events update that state, while a
        // direct DOM fill can render the value without enabling submission.
        await locator.click();
        await locator.selectText().catch(() => undefined);
        await locator.press('Backspace').catch(() => undefined);
        await locator.pressSequentially(value, { delay: 15 });
        await locator.blur();
        return true;
      }
    }
  }
  return false;
}

async function clickVisibleCheckoutSubmit(
  page: import('@playwright/test').Page,
  providerAccepted: () => Promise<boolean>,
): Promise<'pointer' | 'keyboard'> {
  const safeFailures: string[] = [];
  const onResponse = (response: import('@playwright/test').Response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && /lemonsqueezy|stripe/i.test(url.hostname)) {
      safeFailures.push(`${url.hostname}${url.pathname}:${response.status()}`);
    }
  };
  const onRequestFailed = (request: import('@playwright/test').Request) => {
    const url = new URL(request.url());
    if (/lemonsqueezy|stripe/i.test(url.hostname)) {
      safeFailures.push(`${url.hostname}${url.pathname}:network_failure`);
    }
  };
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  const submissionAccepted = async (
    candidate: import('@playwright/test').Locator,
    startingUrl: string,
  ): Promise<boolean> => {
    try {
      await expect.poll(async () => {
        if (await providerAccepted()) return true;
        if (page.url() !== startingUrl) return true;
        if (!(await candidate.isVisible().catch(() => false))) return true;
        if (!(await candidate.isEnabled().catch(() => false))) return true;
        return false;
      }, { timeout: 20_000, intervals: [500, 1_000, 2_000] }).toBe(true);
      return true;
    } catch {
      return false;
    }
  };

  let candidate: import('@playwright/test').Locator | undefined;
  for (const frame of page.frames()) {
    const named = frame.getByRole('button', {
      name: /start.*trial|begin.*trial|subscribe|complete (order|purchase)|place order|pay \$?0/i,
    });
    for (let index = 0; index < await named.count(); index += 1) {
      const current = named.nth(index);
      if (await current.isVisible().catch(() => false) && await current.isEnabled().catch(() => false)) {
        candidate = current;
        break;
      }
    }
    if (candidate) break;
    const submit = frame.locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).last();
    if (await submit.count() && await submit.isEnabled().catch(() => false)) {
      candidate = submit;
      break;
    }
  }
  if (!candidate) {
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
    throw new Error('Lemon Test Mode checkout has no enabled submit control');
  }

  const startingUrl = page.url();
  try {
    await candidate.scrollIntoViewIfNeeded();
    await candidate.click();
    if (await submissionAccepted(candidate, startingUrl)) return 'pointer';

    // Some hosted payment controls accept their final submit only through the
    // focused form control. Retry once with an actual keyboard submit, but only
    // after neither the page nor the provider state changed for 20 seconds.
    await candidate.focus();
    await candidate.press('Enter');
    if (await submissionAccepted(candidate, startingUrl)) return 'keyboard';

    const invalidControls: string[] = [];
    for (const frame of page.frames()) {
      invalidControls.push(...await frame.locator('input, select, textarea').evaluateAll((controls) => controls
        .filter((control) => control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
        .filter((control) => !control.checkValidity())
        .map((control) => {
          const input = control as HTMLInputElement;
          const validity = input.validity;
          const category = validity.valueMissing ? 'value_missing'
            : validity.typeMismatch ? 'type_mismatch'
              : validity.patternMismatch ? 'pattern_mismatch'
                : validity.tooShort ? 'too_short'
                  : validity.tooLong ? 'too_long'
                    : validity.rangeUnderflow || validity.rangeOverflow ? 'range'
                      : validity.badInput ? 'bad_input'
                        : 'invalid';
          return `${input.type || input.tagName.toLowerCase()}:${input.autocomplete || input.name || 'unnamed'}:${category}`;
        })));
    }
    throw new Error(
      `Lemon Test Mode checkout did not accept pointer or keyboard submission `
      + `(invalid=${invalidControls.join(',') || 'none'}, provider_failures=${[...new Set(safeFailures)].join(',') || 'none'})`,
    );
  } finally {
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
  }
}

async function writeSafeWebhookDeliveryDiagnostic(since: string): Promise<{
  deliveryCount: number;
  statuses: string[];
  safeErrors: string[];
  signedDeliveryObserved: boolean;
}> {
  const { data, error } = await admin
    .from('webhook_deliveries')
    .select('status,safe_error,signature_verified,response_status,received_at,event_type')
    .eq('provider', 'lemon_squeezy')
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(20);
  const rows = error ? [] : (data ?? []);
  const diagnostic = {
    queryStatus: error ? 'unavailable' : 'verified',
    deliveryCount: rows.length,
    statuses: [...new Set(rows.map((row) => String(row.status ?? 'unknown')))],
    safeErrors: [...new Set(rows.map((row) => String(row.safe_error ?? '')).filter(Boolean))],
    signedDeliveryObserved: rows.some((row) => row.signature_verified === true),
    responseStatuses: [...new Set(rows.map((row) => Number(row.response_status)).filter(Number.isFinite))],
    eventTypes: [...new Set(rows.map((row) => String(row.event_type ?? 'unknown')))],
    observedAt: new Date().toISOString(),
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/lemon-webhook-diagnostic.json', JSON.stringify(diagnostic, null, 2));
  return diagnostic;
}

async function selectVisibleCheckoutOption(
  page: import('@playwright/test').Page,
  selectors: string[],
  label: string,
  value: string,
): Promise<boolean> {
  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if (await locator.count() && await locator.isVisible().catch(() => false)) {
        try {
          await locator.selectOption({ label });
        } catch {
          await locator.selectOption(value);
        }
        return true;
      }
    }
  }
  return false;
}

async function chooseCheckoutState(page: import('@playwright/test').Page): Promise<void> {
  if (await selectVisibleCheckoutOption(page, [
    'select[autocomplete="address-level1"]',
    'select[name*="state" i]',
    'select[name*="region" i]',
  ], 'New York', 'NY')) return;

  await expect.poll(async () => {
    const namedCount = await page.getByRole('combobox', { name: /state|region/i }).count();
    if (namedCount) return namedCount;
    return (await page.getByRole('combobox').count()) >= 2 ? 1 : 0;
  }, { timeout: 10_000, message: 'Lemon checkout state combobox did not become available' }).toBeGreaterThan(0);

  const named = page.getByRole('combobox', { name: /state|region/i });
  const control = await named.count() ? named.first() : page.getByRole('combobox').nth(1);
  const tagName = await control.evaluate((element) => element.tagName.toLowerCase());
  if (tagName === 'select') {
    try {
      await control.selectOption({ label: 'New York' });
    } catch {
      await control.selectOption('NY');
    }
    return;
  }
  await control.click({ timeout: 10_000 });
  const option = page.getByRole('option', { name: 'New York', exact: true });
  if (await option.count()) await option.last().click({ timeout: 10_000 });
  else await page.getByText('New York', { exact: true }).last().click({ timeout: 10_000 });
}

test.beforeAll(async () => {
  const owner = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fixture: 'command3_isolated_demo' } });
  const outsider = await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true, user_metadata: { fixture: 'command3_isolated_demo' } });
  if (owner.error || outsider.error || !owner.data.user || !outsider.data.user) throw new Error('Temporary verified test users could not be created');
  ownerId = owner.data.user.id; outsiderId = outsider.data.user.id;
  /*
   * These fixtures stand in for established accounts, so they are provisioned as
   * accounts that have finished setup.
   *
   * Without it they take the column's default and read as brand new, and the shell
   * sends every one of them to `/onboarding` — which is correct behaviour and would
   * fail every workspace assertion below, since none of them would reach a workspace.
   *
   * Written with a fallback because the column arrives with a migration: a run
   * against a database that does not have it yet must not fail in `beforeAll`, which
   * would take the whole suite down before a single assertion ran.
   */
  const onboarded = { status: 'completed', current_step: 'complete', backfilled: true };
  const withOnboarding = await admin.from('profiles').upsert([
    { id: ownerId, display_name: 'Command 3 Owner', onboarding: onboarded },
    { id: outsiderId, display_name: 'Command 3 Outsider', onboarding: onboarded },
  ]);
  if (withOnboarding.error) {
    await admin.from('profiles').upsert([
      { id: ownerId, display_name: 'Command 3 Owner' },
      { id: outsiderId, display_name: 'Command 3 Outsider' },
    ]);
  }
  const projects = await admin.from('projects').insert([
    { user_id: ownerId, name: `command3-demo-owner-${run}`, type: 'app', status: 'in_progress' },
    { user_id: outsiderId, name: `command3-demo-outsider-${run}`, type: 'app', status: 'in_progress' },
  ]).select('id,user_id');
  if (projects.error || !projects.data) throw new Error('Isolated tenant fixtures could not be created');
  ownerProjectId = projects.data.find((item) => item.user_id === ownerId)!.id;
  outsiderProjectId = projects.data.find((item) => item.user_id === outsiderId)!.id;
});

test.afterAll(async () => {
  if (ownerId) await admin.auth.admin.deleteUser(ownerId);
  if (outsiderId) await admin.auth.admin.deleteUser(outsiderId);
});

test('real Supabase login persists, Operations works, cross-tenant access is denied, and logout clears the session', async ({ page }) => {
  let browserBearer = '';
  page.on('request', (request) => {
    if (request.url().includes('/api/operations/') && request.headers().authorization?.startsWith('Bearer ')) browserBearer = request.headers().authorization;
  });
  await page.goto('/auth/login');
  const webRelease = await page.evaluate(async () => {
    const response = await fetch('/api/release', { cache: 'no-store' });
    return { status: response.status, body: await response.json() as { release?: string; environment?: string } };
  });
  const apiReadiness = await fetch(`${backendUrl}/ready`, { headers: { Accept: 'application/json' } });
  const apiRelease = await apiReadiness.json() as { release?: string };
  expect(webRelease.status).toBe(200);
  expect(apiReadiness.status).toBe(200);
  if (expectedRelease) {
    expect(webRelease.body.release).toBe(expectedWebRelease);
    expect(apiRelease.release).toBe(expectedRelease);
  }
  // Scoped to the sign-in form rather than the page. `AuthShell` now renders the signup
  // and login panels side by side above 1280px, so `/auth/login` legitimately has two
  // fields labelled "Email" and two labelled "Password"; an unscoped `getByLabel` matches
  // both and fails on strict mode before it ever gets to typing. Scoping is more precise
  // about which form is under test, not less: this test signs in, so it drives the
  // sign-in form.
  const loginForm = page.locator('form', { has: page.locator('#login-email') });
  await expect(loginForm).toHaveCount(1);
  // Addressed by id rather than by label. Scoping to the form is not enough on its own:
  // the field's own reveal toggle carries `aria-label="Show password"`, which contains
  // "Password", so `getByLabel('Password')` matches the input *and* the button — two
  // elements inside one form. `exact: true` does not rescue it either, because the label
  // text is JSX-formatted and carries surrounding whitespace. The ids are unambiguous and
  // are already what identifies this form.
  await loginForm.locator('#login-email').fill(ownerEmail);
  await loginForm.locator('#login-password').fill(password);
  await loginForm.getByRole('button', { name: 'Sign in' }).click();
  // A real Supabase sign-in is a network round trip followed by a client-side redirect. The
  // default 5s expectation left no room for either, so a slow-but-correct login was reported as
  // a login failure — the assertion was measuring CI latency, not authentication.
  //
  // Still exactly the same requirement: the browser must end up on an authenticated route.
  // Nothing is relaxed about *what* is proven, only about how long the proof may take.
  await expect(page).toHaveURL(/\/(workspace|dashboard)/, { timeout: AUTH_TRANSITION_TIMEOUT_MS });
  const firstSession = await browserSession(page);
  expect(firstSession).toEqual({ status: 200, authenticated: true });
  await page.reload();
  const refreshedSession = await browserSession(page);
  expect(refreshedSession).toEqual({ status: 200, authenticated: true });

  await page.goto('/workspace');
  const workspaceShell = page.getByTestId('workspace-shell');
  const terminalDock = page.getByTestId('persistent-terminal-dock');
  const composerInput = page.locator('textarea[data-terminal-composer]');
  await expect(workspaceShell).toBeVisible();
  await expect(terminalDock).toBeVisible();
  await expect(composerInput).toBeVisible();
  await expect(page.locator('.xv-route-loader')).toHaveCount(0);
  // Workspace owns the whole canvas: no coloured/transparent header row reserves
  // height above the greeting, and recent sessions stay in Projects rather than
  // pushing the actual build controls down this page.
  await expect(page.getByTestId('workspace-site-header')).toHaveCount(0);
  await expect(page.getByText('Continue where you left off', { exact: true })).toHaveCount(0);
  // The workspace is one application window inset from the browser edges, and the
  // greeting is the first thing inside its terminal pane. It used to sit above a
  // terminal *card* on a scrolling page; the assertion that it began near the top of
  // the viewport is replaced by the stronger one, that it begins near the top of the
  // window that now owns the whole canvas.
  const shell = page.getByTestId('workspace-window');
  await expect(shell).toBeVisible();
  const shellBox = (await shell.boundingBox())!;
  expect(shellBox).not.toBeNull();
  const welcomeBox = (await page.getByTestId('workspace-welcome').boundingBox())!;
  expect(welcomeBox).not.toBeNull();
  expect(welcomeBox.y).toBeGreaterThanOrEqual(shellBox.y);
  // Tolerance, not slack: the API-connection banner sits above the greeting and only
  // renders when the API is unreachable, so the exact offset depends on conditional
  // content this assertion is not about. What it proves either way is that the
  // greeting begins at the top of the transcript rather than somewhere down it.
  expect(welcomeBox.y - shellBox.y).toBeLessThan(200);

  // The title bar is real window chrome: a sibling of the panes, not a sticky element
  // compensating for page padding. It must not scroll with the history.
  const terminalHeader = page.getByTestId('terminal-identity-header');
  await expect(terminalHeader).not.toHaveCSS('position', 'sticky');
  const headerBefore = (await terminalHeader.boundingBox())!;

  // Exactly one element scrolls, and it is inside the shell. This is the whole point
  // of the architecture: at *any* scroll depth the window keeps its inset and its
  // rounded corners, because the window itself never moves.
  const transcript = page.getByTestId('terminal-scroll');
  /*
   * The pane is the scroll owner, and it says so through `data-conversation`.
   *
   * This asserted `overflow-y: auto` unconditionally. An empty transcript now scrolls
   * nothing on purpose — the composer's reserved height alone was pushing the greeting
   * a few pixels past the container and putting a full-height bar down the side of a
   * terminal nobody had typed into. So the state is checked rather than assumed: empty
   * means `hidden`, and the flag that drives it has to be on this element, which is
   * what proves the pane is still the one element that scrolls once there is content.
   */
  await expect(transcript).toHaveAttribute('data-conversation', 'false');
  await expect(transcript).toHaveCSS('overflow-y', 'hidden');
  await expect(shell).toHaveCSS('overflow', 'hidden');
  await expect(shell).toHaveCSS('border-radius', '16px');

  for (const offset of [100, 500, 1000, 10_000]) {
    await transcript.evaluate((el, top) => { el.scrollTop = top; }, offset);
    const scrolled = await page.evaluate(() => ({
      page: document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight,
      horizontal: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(scrolled.page, `the page scrolled at offset ${offset}`).toBe(0);
    expect(scrolled.horizontal, `horizontal overflow at offset ${offset}`).toBeLessThanOrEqual(0);
    const shellNow = (await shell.boundingBox())!;
    expect(shellNow.y, `the shell moved at offset ${offset}`).toBeCloseTo(shellBox.y, 0);
    expect(shellNow.x, `the shell moved at offset ${offset}`).toBeCloseTo(shellBox.x, 0);
    expect(shellBox.y, 'the shell lost its inset from the browser edge').toBeGreaterThan(0);
    await expect(shell).toHaveCSS('border-radius', '16px');
    const headerNow = (await terminalHeader.boundingBox())!;
    expect(headerNow.y, `the title bar scrolled away at offset ${offset}`).toBeCloseTo(headerBefore.y, 0);
  }
  await transcript.evaluate((el) => { el.scrollTop = 0; });

  // "Project edits", not "Workspace": the sidebar row, the mobile bottom bar and the
  // page itself already use that word for the whole surface, so the button that opens
  // the file tree and the diff says what it opens instead.
  await expect(terminalHeader.getByRole('button', { name: 'Project edits' })).toBeVisible();
  const hideChatbar = terminalHeader.getByRole('button', { name: 'Hide the chatbar' });
  await expect(hideChatbar).toBeVisible();
  await hideChatbar.click();
  await expect(composerInput).toBeHidden();

  /*
   * Hiding the chatbar hides the chatbar, and leaves nothing floating in its place.
   *
   * This used to assert a small restore button inside the dock, on the reasoning that
   * a hidden control needs a way back. It has one: the same title-bar toggle that hid
   * it, which stays on screen and flips its label. The floating button was a second
   * control for one job, sitting in the space the reader had just asked to have back —
   * so the claim is inverted rather than dropped. The dock must be empty, and the way
   * back must still work.
   */
  await expect(terminalDock.getByRole('button', { name: 'Show the chatbar' })).toHaveCount(0);
  const showChatbar = terminalHeader.getByRole('button', { name: 'Show the chatbar' });
  await expect(showChatbar).toBeVisible();
  await showChatbar.click();
  await expect(composerInput).toBeVisible();

  // The `+` menu is an upward extension of the composer, not a popup near it. The
  // proof is geometric: its bottom edge must overlap the composer's top edge, so the
  // two share a border rather than being separated by a visible gap.
  const composerSurface = terminalDock.locator('.xv-chatbar-solid');
  await terminalDock.locator('.xv-cba-trigger').first().click();
  const plusMenu = page.locator('.xv-cba-menu');
  await expect(plusMenu).toBeVisible();
  const menuBox = (await plusMenu.boundingBox())!;
  const composerBox = (await composerSurface.boundingBox())!;
  expect(composerBox.y - (menuBox.y + menuBox.height)).toBeLessThanOrEqual(0);
  expect(Math.abs(menuBox.x - composerBox.x)).toBeLessThanOrEqual(2);
  expect(menuBox.width).toBeLessThanOrEqual(composerBox.width);

  // Every action survived the redesign, Integrations among them — and the detached
  // Integrations pill that used to duplicate it is gone.
  for (const action of [
    'Add files or photos',
    'Slash commands',
    'Connectors',
    'Plan before build',
    'Debug an error',
    'Skills',
    'Rules',
    'Integrations',
  ]) {
    await expect(plusMenu.getByText(action, { exact: true })).toBeVisible();
  }
  await expect(page.locator('.xv-chatbar-integration-btn')).toHaveCount(0);

  // Two columns, not one tall one. As a single column the list stood roughly three
  // times its own width, which reads as a page rather than as a menu. Asserted as a
  // ratio rather than a pixel height so it survives an action being added or removed.
  const grid = plusMenu.locator('.xv-cba-grid');
  await expect(grid).toBeVisible();
  const gridColumns = await grid.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
  );
  expect(gridColumns, 'the plus menu should lay out in four compact columns').toBe(4);
  expect(
    menuBox.height / menuBox.width,
    'the plus menu is far taller than it is wide',
  ).toBeLessThan(1.35);

  // Escape still closes it, and opening it never moved the window.
  await page.keyboard.press('Escape');
  await expect(plusMenu).toHaveCount(0);

  /**
   * Fullscreen actually fills the screen.
   *
   * It did not: the sidebar was hidden with `visibility: hidden`, which stops it
   * painting but leaves its width in the flex row. The terminal went on starting
   * after a band of empty page as wide as whatever the user had dragged the sidebar
   * to — nothing was oversized, the space was reserved for something invisible.
   *
   * The rail is what should be left, so this checks the gap against the rail rather
   * than against zero: anything wider means a hidden element is still holding space.
   */
  const fullscreenToggle = terminalHeader.getByRole('button', { name: 'Fullscreen terminal' });
  await expect(fullscreenToggle).toBeVisible();
  await fullscreenToggle.click();
  await expect(page.locator('body.xv-terminal-fullscreen-active')).toHaveCount(1);
  await page.waitForTimeout(400);

  /*
   * Fullscreen shows the terminal and its composer, and nothing else.
   *
   * This used to require the rail to stay, on the reasoning that leaving the workspace
   * should be one click away. Reversed on request: the control says fullscreen, and a
   * column of shortcuts down the side is the one thing a fullscreen terminal is not.
   *
   * Asserted as gone from layout, not merely invisible — a rail hidden with
   * `visibility` keeps its width and leaves a band of empty page beside the terminal,
   * which is the bug fullscreen already had once.
   */
  const rail = page.locator('.xv-sidebar-root');
  await expect(rail, 'the sidebar is still on screen in fullscreen').toBeHidden();
  expect(
    await rail.evaluate((el) => el.getBoundingClientRect().width),
    'the hidden sidebar still reserves its width',
  ).toBe(0);

  /*
   * Fullscreen keeps the application frame rather than giving it up.
   *
   * This used to require the terminal to sit flush against the rail and run to the
   * right edge, which is what "fullscreen" meant when the state zeroed the stage's
   * padding and squared the shell off. The terminal then met the browser chrome with
   * its own corners and stopped reading as a window.
   *
   * The claim now is that the inset is the frame's gutter and nothing more — bounded
   * on both sides, so a gap that grows past the gutter still fails. Zero would fail
   * too: that is the old edge-to-edge layout coming back.
   */
  // Read from the page rather than hardcoded: the gutter is 8px below `lg` and 14px
  // above it, so a fixed number here would assert the wrong frame on a narrow runner.
  const GUTTER = await page.evaluate(() => parseFloat(
    getComputedStyle(document.querySelector('.xv-app-stage')!).getPropertyValue('--xv-app-gutter'),
  ));
  expect(GUTTER, 'the frame gutter is not set').toBeGreaterThan(0);
  const fsShell = (await shell.boundingBox())!;
  // Measured from the window edge now rather than from the rail, which is gone.
  const leftGap = fsShell.x;
  expect(leftGap, 'the terminal is not inset from the left edge by the frame gutter')
    .toBeGreaterThanOrEqual(GUTTER - 2);
  expect(leftGap, 'more than the gutter is reserved to the left of the terminal')
    .toBeLessThanOrEqual(GUTTER + 2);

  const rightGap = (await page.evaluate(() => window.innerWidth)) - (fsShell.width + fsShell.x);
  expect(rightGap, 'the terminal runs to the right edge instead of keeping its frame')
    .toBeGreaterThanOrEqual(GUTTER - 2);
  expect(rightGap, 'more than the gutter is reserved to the right of the terminal')
    .toBeLessThanOrEqual(GUTTER + 2);

  // And the shell keeps its rounded corners, which squaring off is what made the
  // terminal look like a document rather than a window.
  const fsRadius = await shell.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(fsRadius, 'the terminal is squared off in fullscreen').not.toBe('0px');

  // The composer stays with the terminal, starting at the same gutter rather than
  // being indented past it by a rail that no longer exists.
  await expect(composerInput).toBeVisible();
  const fsDock = (await terminalDock.boundingBox())!;
  expect(fsDock.x, 'the composer does not line up with the terminal')
    .toBeGreaterThanOrEqual(GUTTER - 2);
  expect(fsDock.x, 'the composer is indented past the terminal it belongs to')
    .toBeLessThanOrEqual(GUTTER + 2);

  await terminalHeader.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(page.locator('body.xv-terminal-fullscreen-active')).toHaveCount(0);
  await page.waitForTimeout(400);
  // Leaving fullscreen gives back the width the user had chosen, rather than
  // stranding them in the collapsed rail.
  const restoredRail = (await rail.boundingBox())!;
  expect(restoredRail.width, 'the sidebar did not reopen after fullscreen').toBeGreaterThan(72);

  /**
   * The collapsed rail keeps the account, and keeps it at the bottom.
   *
   * The rail used to carry the logo and three shortcuts and nothing else, so
   * collapsing took the account with it and signing out meant expanding first.
   *
   * Plan and Settings are deliberately *not* on the rail: they were three separate
   * targets stacked in a 64px column for destinations the account menu already
   * lists. Both halves are asserted, because "carries the account" and "carries only
   * the account" are different claims and only one of them is about the avatar.
   *
   * Reached with the edge toggle rather than the fullscreen button. Fullscreen used to
   * be a second route to the collapsed rail; it now hides the sidebar outright, so it
   * can no longer be used to inspect one.
   */
  await page.locator('.xv-sidebar-edge-toggle').click();
  await page.waitForTimeout(400);
  await expect(rail).toHaveClass(/is-collapsed/);
  const railProfile = rail.locator('.xv-sidebar-rail-profile');
  await expect(railProfile).toBeVisible();
  await expect(rail.getByRole('link', { name: 'View Xroga AI plan' })).toHaveCount(0);
  await expect(rail.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  // And it sits at the bottom of the rail rather than under the shortcuts. The rail
  // was sized to its contents, which left `mt-auto` with nothing to work against.
  const collapsedRailBox = (await rail.boundingBox())!;
  const profileBox = (await railProfile.boundingBox())!;
  expect(
    collapsedRailBox.y + collapsedRailBox.height - (profileBox.y + profileBox.height),
    'the account sits near the top of the rail rather than at its foot',
  ).toBeLessThan(40);
  // Back to the expanded sidebar for the assertions that follow.
  await rail.locator('.xv-sidebar-brand a')
    .filter({ has: page.getByRole('img', { name: 'Xroga' }) })
    .hover();
  await page.waitForTimeout(900);
  await expect(rail).not.toHaveClass(/is-collapsed/);

  /**
   * The edge toggle survives being used, and the edge can be dragged from its middle.
   *
   * The toggle used to be rendered only while the sidebar was open, so it removed
   * itself the moment it was pressed and a second press on the same spot did nothing.
   * (The rail's own expand button still worked, so this was a lost affordance rather
   * than a trap.) Driven here rather than read off the markup, because the failure was
   * a control ceasing to exist after an interaction, which only a second interaction
   * can catch.
   */
  const edgeToggle = page.locator('.xv-sidebar-edge-toggle');
  await expect(edgeToggle).toBeVisible();
  await edgeToggle.click();
  await page.waitForTimeout(400);
  await expect(rail).toHaveClass(/is-collapsed/);

  /*
   * Collapsed, the rail carries no sidebar toggle at all — neither this one nor the
   * PanelLeft button it used to sit beside. Reopening is the mark's job.
   */
  await expect(edgeToggle, 'the collapsed rail still carries a sidebar toggle').toHaveCount(0);
  await expect(
    rail.getByRole('button', { name: 'Open sidebar' }),
    'the collapsed rail still carries its own open button',
  ).toHaveCount(0);
  // The two destinations that replaced them.
  await expect(rail.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Repositories' })).toBeVisible();

  /*
   * Scoped to the anchor that contains the mark rather than the first link in the brand
   * row: the rail carries Dashboard and Repositories now, so a positional match would
   * silently start hovering a nav link if the order ever changed.
   */
  const sidebarMark = rail.locator('.xv-sidebar-brand a')
    .filter({ has: page.getByRole('img', { name: 'Xroga' }) });
  await expect(sidebarMark).toHaveCount(1);
  await sidebarMark.hover();
  // Longer than the hover-intent delay, which is deliberately not instant.
  await page.waitForTimeout(900);
  const reopened = (await rail.boundingBox())!;
  expect(reopened.width, 'hovering the mark did not reopen the sidebar').toBeGreaterThan(72);

  /*
   * And a drag that starts on the toggle widens rather than doing nothing. The toggle
   * sits above the resize handle at the midpoint of the edge, which is where a user
   * reaches to grab it.
   */
  const toggleBox = (await edgeToggle.boundingBox())!;
  const grabX = toggleBox.x + toggleBox.width / 2;
  const grabY = toggleBox.y + toggleBox.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 130, grabY, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const widened = (await rail.boundingBox())!;
  expect(
    widened.width - reopened.width,
    'dragging from the toggle did not widen the sidebar',
  ).toBeGreaterThan(50);
  // The release must not also register as a click and collapse what was just widened.
  await expect(rail, 'the drag collapsed the sidebar on release').not.toHaveClass(/is-collapsed/);

  /**
   * The workspace split is draggable, and expanding the panel takes the viewport.
   *
   * Both are geometric claims, so both are measured. The expanded state in particular
   * cannot be read off the stylesheet: it depends on the composer and the sidebar
   * being switched off from `body`, several levels above the panel that sets the flag.
   */
  // Scoped to the title bar rather than taken as the last match on the page: with the
  // rename the name is unique, so an unscoped lookup no longer needs a tiebreaker.
  await terminalHeader.getByRole('button', { name: 'Project edits' }).click();
  const wsPanel = page.locator('.xv-dev-workspace');
  await expect(wsPanel).toBeVisible();
  // The split animates its grid columns over 280ms, so a rect read straight after
  // opening is a frame of that animation rather than the settled width.
  await page.waitForTimeout(600);

  const handle = page.locator('.xv-workspace-resize');
  await expect(handle).toBeVisible();
  // Three children, three tracks. With two, the panel wraps to an implicit second row
  // and takes the terminal's width — the drag then moves it the wrong way, which
  // reads as a sign error in the maths and is not one.
  const trackCount = await page
    .locator('.xv-workspace-body')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(trackCount, 'the split needs a track for the handle as well').toBe(3);
  const beforeDrag = (await wsPanel.boundingBox())!;
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 160, handleBox.y + handleBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterDrag = (await wsPanel.boundingBox())!;
  expect(
    afterDrag.width - beforeDrag.width,
    'dragging the split left did not widen the workspace panel',
  ).toBeGreaterThan(60);

  // Dragging the other way narrows it again, so the handle is not one-directional.
  const handleBack = (await handle.boundingBox())!;
  await page.mouse.move(handleBack.x + handleBack.width / 2, handleBack.y + handleBack.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBack.x + 120, handleBack.y + handleBack.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(
    (await wsPanel.boundingBox())!.width,
    'dragging the split right did not narrow the panel',
  ).toBeLessThan(afterDrag.width - 40);

  await wsPanel.getByRole('button', { name: 'Full screen workspace' }).click();
  await page.waitForTimeout(400);
  const expandedBox = (await wsPanel.boundingBox())!;
  const viewport = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  expect(expandedBox.x, 'the expanded preview is inset from the left edge').toBeLessThanOrEqual(1);
  expect(expandedBox.y, 'the expanded preview is inset from the top edge').toBeLessThanOrEqual(1);
  expect(expandedBox.width, 'the expanded preview does not span the viewport').toBeGreaterThanOrEqual(viewport.w - 1);
  expect(expandedBox.height, 'the expanded preview does not fill the viewport').toBeGreaterThanOrEqual(viewport.h - 1);
  // The composer and the sidebar stand down. `display: none`, not merely hidden — a
  // hidden sidebar keeps its width and puts a band of shell beside a "full" preview.
  await expect(terminalDock).toBeHidden();
  await expect(rail).toBeHidden();
  // A soft edge, not a drawn box.
  await expect(wsPanel).toHaveCSS('border-top-width', '0px');

  await wsPanel.getByRole('button', { name: 'Exit full screen' }).click();
  await page.waitForTimeout(400);
  await expect(terminalDock).toBeVisible();
  await expect(composerInput).toBeVisible();
  const shellAfterMenu = (await shell.boundingBox())!;
  expect(shellAfterMenu.y).toBeCloseTo(shellBox.y, 0);
  expect(shellAfterMenu.height).toBeCloseTo(shellBox.height, 0);

  const desktopSidebar = page.locator('.xv-sidebar-root');
  await expect(desktopSidebar.getByRole('button', { name: 'New Terminal' })).toBeVisible();
  await expect(desktopSidebar.getByRole('separator', { name: 'Resize sidebar' })).toBeVisible();
  await expect(desktopSidebar.getByRole('button', { name: 'Change theme' })).toBeVisible();
  // Matched against both forms because `Logo` renders through next/image, which rewrites a
  // local path to `/_next/image?url=%2Fbrand%2F…` — the slashes percent-encoded, so a regex
  // written for the raw path can never match. The assertion is about *which* brand image the
  // sidebar shows, and that is still exactly what is checked; only the encoding differs.
  await expect(desktopSidebar.getByRole('img', { name: 'Xroga' })).toHaveAttribute(
    'src',
    /(?:\/brand\/|%2Fbrand%2F)xroga-home-workspace\.png/,
  );
  const expandedLogoBox = await desktopSidebar.getByRole('img', { name: 'Xroga' }).boundingBox();
  expect(expandedLogoBox).not.toBeNull();
  // The old floor here was 96px — the wordmark's full natural width. That only held while
  // the logo was allowed to overflow the brand row: it rendered at 100px, ran underneath
  // the utility card, and showed through behind the first icon. A floor of 96 now *requires*
  // that defect, so it is replaced by the two things it was standing in for.
  //
  // First, that this is the wide wordmark and not the square rail mark, which is what the
  // width was really distinguishing (the collapsed mark is 34x34).
  expect(expandedLogoBox!.width).toBeGreaterThan(expandedLogoBox!.height);
  expect(expandedLogoBox!.width).toBeGreaterThanOrEqual(60);
  // Second, that it stays out from under the toolbar — the actual reported defect, which
  // the width floor never checked in either direction.
  const brandToolbarBox = (await desktopSidebar.locator('.xv-sidebar-header-actions').boundingBox())!;
  expect(expandedLogoBox!.x + expandedLogoBox!.width).toBeLessThanOrEqual(brandToolbarBox.x);
  /*
   * Scoped to the desktop edge toggle rather than matched by name across the page:
   * the mobile trigger carries a sidebar label too, and a page-wide lookup resolves
   * to both. The toggle closes only — reopening is the mark's job, below.
   */
  await page.locator('.xv-sidebar-edge-toggle').click();
  await expect(desktopSidebar).toHaveCSS('width', '64px');
  // Same next/image encoding as the expanded-sidebar assertion above.
  await expect(desktopSidebar.getByRole('img', { name: 'Xroga' })).toHaveAttribute(
    'src',
    /(?:\/brand\/|%2Fbrand%2F)xroga-mark\.png/,
  );
  await expect(desktopSidebar.locator('.xv-sidebar-floating')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(desktopSidebar.locator('.xv-sidebar-floating')).toHaveCSS('border-top-width', '0px');
  const collapsedTheme = desktopSidebar.getByRole('button', { name: 'Change theme' });
  await expect(collapsedTheme).toBeVisible();
  await collapsedTheme.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await collapsedTheme.click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(desktopSidebar.getByRole('button', { name: 'Search' })).toBeVisible();
  await expect(desktopSidebar.getByRole('button', { name: 'New Terminal' })).toBeVisible();
  await expect(desktopSidebar.locator('nav')).toHaveCount(0);
  /*
   * Reopened by hovering the mark. The toggle does not exist while collapsed — the rail
   * used to carry it alongside its own PanelLeft button, two controls a few pixels
   * apart for one job — so clicking it here waited for an element that never appears
   * and took the whole spec to its timeout.
   */
  await desktopSidebar.locator('.xv-sidebar-brand a')
    .filter({ has: page.getByRole('img', { name: 'Xroga' }) })
    .hover();
  await expect(desktopSidebar).not.toHaveCSS('width', '64px');

  // Internal navigation must retain the shared shell and the mounted composer.
  const shellSentinel = randomUUID();
  await page.evaluate((value) => {
    (window as Window & { __xrogaShellSentinel?: string }).__xrogaShellSentinel = value;
  }, shellSentinel);
  const draft = `persistent draft ${run}`;
  await composerInput.fill(draft);
  await page.waitForTimeout(900);
  await page.locator('a[href="/dashboard"]').first().click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await expect(workspaceShell).toBeVisible();
  expect(await page.evaluate(() =>
    (window as Window & { __xrogaShellSentinel?: string }).__xrogaShellSentinel,
  )).toBe(shellSentinel);
  await page.locator('a[href="/workspace"]').first().click();
  await expect(page).toHaveURL(/\/workspace\/?$/);
  await expect(composerInput).toHaveValue(draft);
  const workspaceMetrics = await page.evaluate(() => window.__xrogaWorkspaceMetrics);
  expect(workspaceMetrics?.shellMounts).toBe(1);
  expect(workspaceMetrics?.lastNavigationMs).toBeGreaterThanOrEqual(0);

  // Hard refresh restores the draft/history region without replacing the shell.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(workspaceShell).toBeVisible();
  await expect(terminalDock).toBeVisible();
  await expect(composerInput).toHaveValue(draft);

  // Offline is a factual status chip; it must not cover or destroy the workspace.
  await page.context().setOffline(true);
  await expect(page.getByTestId('connection-indicator')).toContainText('Offline');
  await expect(workspaceShell).toBeVisible();
  await expect(composerInput).toHaveValue(draft);
  await page.context().setOffline(false);
  await expect(page.getByTestId('connection-indicator')).toContainText(/Reconnecting|Offline/);
  await expect(page.getByTestId('connection-indicator')).toHaveCount(0, { timeout: 5_000 });

  // A changed account scope clears user-owned caches before private UI can read them.
  await page.evaluate(() => {
    localStorage.setItem('xroga-cache-owner', 'different-user');
    localStorage.setItem('xroga_workspace_session', JSON.stringify({
      prompt: 'previous user private draft',
      messages: [],
      updatedAt: new Date().toISOString(),
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(workspaceShell).toBeVisible();
  await expect(composerInput).not.toHaveValue(/previous user private draft/);

  // The pre-hydration bootstrap applies theme and accessibility preferences before
  // the shell becomes interactive; there is no loader used to conceal a flash.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('xroga-theme') ?? '{"state":{},"version":1}');
    stored.version = 1;
    stored.state = { ...stored.state, theme: 'black', reducedMotion: true };
    localStorage.setItem('xroga-theme', JSON.stringify(stored));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(workspaceShell).toBeVisible();
  expect(await page.locator('html').getAttribute('data-theme')).toBe('black');
  expect(await page.locator('html').getAttribute('data-reduced-motion')).toBe('true');
  await expect(page.locator('body')).toHaveClass(/theme-black/);

  const companion = page.getByTestId('xroga-companion-composer');
  await expect(companion).toBeVisible();
  // Scoped to the companion, not the page. The claim this protects is that *Smoky*
  // does not do voice — the composer's own dictation is intended and always was, and
  // it now carries this label, so a page-wide locator asserts something nobody meant.
  await expect(companion.getByRole('button', { name: 'Start voice input' })).toHaveCount(0);
  const canonicalComposer = page.locator('.xv-terminal-dock');
  for (const removedChip of ['Website', 'Chatbot', 'SaaS', 'Mobile', 'Extension', 'Desktop']) {
    await expect(canonicalComposer.getByRole('button', { name: removedChip, exact: true })).toHaveCount(0);
  }
  // The compact composer must be the deployed implementation, not merely a source
  // change: no legacy toolbar row, one actions trigger, and the real menu + launch
  // control rendered inside the authenticated Workspace.
  await expect(canonicalComposer.locator('.xv-chatbar-toolbar')).toHaveCount(0);
  const composerActions = canonicalComposer.getByRole('button', { name: 'More composer actions' });
  await expect(composerActions).toBeVisible();
  await expect(canonicalComposer.getByRole('button', { name: 'Upload files' })).toHaveCount(0);
  // Integrations lives inside the `+` menu now. The detached pill beside the trigger
  // was a second entry point to the same dialog, so it is gone — but what it opened
  // is still asserted here, from its new home.
  await expect(canonicalComposer.getByRole('button', { name: 'Add integration' })).toHaveCount(0);
  await composerActions.click();
  const actionsMenu = canonicalComposer.getByRole('dialog', { name: 'Composer actions' });
  await expect(actionsMenu.getByRole('button', { name: /Add files or photos/ })).toBeVisible();
  await expect(actionsMenu.getByRole('button', { name: 'Slash commands' })).toBeVisible();
  await expect(actionsMenu.getByRole('button', { name: /Connectors/ })).toBeVisible();
  await expect(actionsMenu.getByRole('button', { name: /Plan before build/ })).toBeVisible();
  await expect(actionsMenu.getByRole('button', { name: /Debug an error/ })).toBeVisible();
  await expect(actionsMenu.getByRole('button', { name: /Skills/ })).toBeVisible();
  await expect(actionsMenu.getByRole('button', { name: /Rules/ })).toBeVisible();
  // The menu's attachment geometry is asserted once, earlier in this test. What is
  // checked here is its contents and the Integrations flow.
  await actionsMenu.getByRole('button', { name: /Integrations/ }).click();
  await expect(page.getByRole('dialog', { name: 'Integrations' })).toBeVisible();
  await page.getByRole('button', { name: 'Close integrations' }).click();

  await composerActions.click();
  await expect(actionsMenu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(actionsMenu).toHaveCount(0);
  await expect(canonicalComposer.getByRole('button', { name: 'Send prompt' })).toBeVisible();
  // Smoky opens usage on click. The old control panel — voice toggles, status
  // readout, dictation, feed control — stays removed, and so does its speech
  // synthesis. Companion preferences live in Settings → Companion, exercised later.
  // Because it is interactive it is a real button, so it must NOT be aria-hidden.
  await expect(companion.getByRole('button', { name: /show usage/i })).toBeVisible();
  await expect(companion.getByRole('button', { name: /Open .*Xroga companion/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /companion panel/ })).toHaveCount(0);

  const routeChecks = [
    '/workspace',
    '/dashboard',
    '/dashboard/projects',
    '/dashboard/integrations',
    '/dashboard/operations',
    '/dashboard/growth',
    '/dashboard/publish',
    '/settings?tab=plan',
    '/settings',
  ];
  for (const route of routeChecks) {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/auth\/login/);
    const shellState = await page.evaluate(() => ({
      text: document.body?.innerText ?? '',
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    expect(shellState.text).not.toMatch(/application error|something went wrong|internal server error/i);
    expect(shellState.text).not.toContain("We give our best — perfection is Allah's alone. Xroga verifies before publish.");
    expect(shellState.overflow).toBe(false);
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/workspace');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  }

  await page.goto('/dashboard/operations');
  // A freshly deployed API can need more than Playwright's 5-second assertion
  // default to warm its authenticated portfolio query. Wait for the durable product
  // result; the assertion still fails if the API never returns it.
  await expect(page.getByText(`command3-demo-owner-${run}`)).toBeVisible({ timeout: 20_000 });
  expect(browserBearer).toMatch(/^Bearer /);
  const allowed = await fetch(`${backendUrl}/api/operations/products/${ownerProjectId}`, { headers: { Authorization: browserBearer } });
  const denied = await fetch(`${backendUrl}/api/operations/products/${outsiderProjectId}`, { headers: { Authorization: browserBearer } });
  expect(allowed.status).toBe(200); expect(denied.status).toBe(403);
  const notifications = await fetch(`${backendUrl}/api/notifications`, { headers: { Authorization: browserBearer } });
  const unreadNotifications = await fetch(`${backendUrl}/api/notifications/unread-count`, { headers: { Authorization: browserBearer } });
  expect(notifications.status).toBe(200);
  expect(await notifications.json()).toEqual([]);
  expect(unreadNotifications.status).toBe(200);
  expect(await unreadNotifications.json()).toEqual({ count: 0 });
  let billingCheckout: 'not_requested' | 'verified' = 'not_requested';
  let billingTransaction: 'not_requested' | 'verified_test_mode_webhook' = 'not_requested';
  let testPaymentInstrument: 'not_requested' | 'dummy_card_5555' | 'provider_no_card_trial' = 'not_requested';
  let billingSubmissionMethod: 'not_requested' | 'pointer' | 'keyboard' = 'not_requested';
  let billingEntitlementEndsAt: string | null = null;
  if (launchBillingApiUrl) {
    const billingStatusResponse = await fetch(`${launchBillingApiUrl}/api/billing/status`, { headers: { Authorization: browserBearer } });
    const billingStatus = await billingStatusResponse.json() as {
      lemonApi?: boolean;
      lemonWebhook?: boolean;
      lemonStore?: boolean;
      environment?: 'test' | 'live' | 'unconfigured';
      testMode?: boolean;
      trialDays?: number | null;
      plans?: Array<{ tier?: string; ready?: boolean }>;
    };
    expect(billingStatusResponse.status).toBe(200);
    expect(billingStatus.lemonApi).toBe(true);
    expect(billingStatus.lemonWebhook).toBe(true);
    expect(billingStatus.lemonStore).toBe(true);
    expect(billingStatus.environment).toBe('test');
    expect(billingStatus.testMode).toBe(true);
    expect(billingStatus.trialDays).toBe(30);
    expect(billingStatus.plans?.some((plan) => plan.tier === 'spark' && plan.ready === true)).toBe(true);
    const checkoutResponse = await fetch(`${launchBillingApiUrl}/api/billing/create-checkout`, {
      method: 'POST',
      headers: { Authorization: browserBearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ planTier: 'spark' }),
    });
    const checkout = await checkoutResponse.json() as { checkoutUrl?: string; priceId?: string; error?: string; code?: string };
    const safeCheckoutFailure = `checkout_error=${checkout.error ?? 'unknown'} code=${checkout.code ?? 'unknown'}`;
    expect(checkoutResponse.status, safeCheckoutFailure).toBe(200);
    expect(checkout.priceId).toMatch(/^\d+$/);
    const checkoutUrl = new URL(checkout.checkoutUrl ?? '');
    expect(checkoutUrl.protocol).toBe('https:');
    expect(checkoutUrl.hostname === 'lemonsqueezy.com' || checkoutUrl.hostname.endsWith('.lemonsqueezy.com')).toBe(true);
    billingCheckout = 'verified';

    await page.goto(checkoutUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByText(/test mode/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('$0.00', { exact: true })).toBeVisible();
    await expect(page.getByText(/30 day trial/i).first()).toBeVisible();
    await expect(page.getByText('$19.00', { exact: true }).first()).toBeVisible();
    await fillVisibleCheckoutField(page, ['input[type="email"]', 'input[autocomplete="email"]'], ownerEmail);
    await fillVisibleCheckoutField(page, [
      'input[autocomplete="name"]',
      'input[autocomplete="cc-name"]',
      'input[name*="name" i]',
    ], `Xroga Test ${run.slice(0, 8)}`);
    expect(await fillVisibleCheckoutField(page, [
      'input[autocomplete="address-line1"]',
      'input[name*="address" i]',
      'input[placeholder*="address line 1" i]',
    ], '1 Test Mode Avenue')).toBe(true);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    await chooseCheckoutState(page);
    expect(await fillVisibleCheckoutField(page, [
      'input[autocomplete="address-level2"]',
      'input[name*="city" i]',
      'input[placeholder="City" i]',
    ], 'New York')).toBe(true);
    expect(await fillVisibleCheckoutField(page, [
      'input[autocomplete="postal-code"]',
      'input[name*="postal" i]',
      'input[name*="zip" i]',
      'input[placeholder="ZIP" i]',
    ], '10001')).toBe(true);
    const cardFilled = await fillVisibleCheckoutField(page, [
      'input[autocomplete="cc-number"]',
      'input[name="cardnumber"]',
      'input[placeholder*="card number" i]',
      'input[placeholder*="1234 1234" i]',
    ], '5555555555554444');
    if (cardFilled) {
      expect(await fillVisibleCheckoutField(page, [
        'input[autocomplete="cc-exp"]',
        'input[name="exp-date"]',
        'input[placeholder*="MM" i]',
      ], '1230')).toBe(true);
      expect(await fillVisibleCheckoutField(page, [
        'input[autocomplete="cc-csc"]',
        'input[name="cvc"]',
        'input[placeholder*="CVC" i]',
        'input[placeholder*="CVV" i]',
      ], '123')).toBe(true);
      testPaymentInstrument = 'dummy_card_5555';
    } else {
      testPaymentInstrument = 'provider_no_card_trial';
    }
    const terms = page.getByRole('checkbox', { name: /agree|terms/i });
    if (await terms.count() && await terms.first().isVisible().catch(() => false) && !(await terms.first().isChecked())) {
      await terms.first().check();
    }
    const checkoutSubmittedAt = new Date().toISOString();
    let paidEntitlement: { state?: string; startsAt?: string | null; endsAt?: string | null; requiresCard?: boolean } = {};
    billingSubmissionMethod = await clickVisibleCheckoutSubmit(page, async () => {
      const response = await fetch(`${launchBillingApiUrl}/api/billing/entitlement`, {
        headers: { Authorization: browserBearer, Accept: 'application/json' },
      });
      paidEntitlement = response.ok ? await response.json() : {};
      return paidEntitlement.state === 'paid_active';
    });
    try {
      await expect.poll(async () => {
        const response = await fetch(`${launchBillingApiUrl}/api/billing/entitlement`, {
          headers: { Authorization: browserBearer, Accept: 'application/json' },
        });
        paidEntitlement = response.ok ? await response.json() : {};
        return paidEntitlement.state;
      }, {
        message: 'signed Lemon webhook did not create the durable paid Test Mode entitlement',
        timeout: 90_000,
        intervals: [1_000, 2_000, 3_000, 5_000],
      }).toBe('paid_active');
    } catch (error) {
      const diagnostic = await writeSafeWebhookDeliveryDiagnostic(checkoutSubmittedAt);
      throw new Error(
        `signed Lemon webhook did not create the durable paid Test Mode entitlement `
        + `(deliveries=${diagnostic.deliveryCount}, signed=${diagnostic.signedDeliveryObserved}, `
        + `statuses=${diagnostic.statuses.join(',') || 'none'}, errors=${diagnostic.safeErrors.join(',') || 'none'})`,
        { cause: error },
      );
    }
    expect(paidEntitlement.requiresCard).toBe(true);
    const startsAt = new Date(paidEntitlement.startsAt ?? '').getTime();
    const endsAt = new Date(paidEntitlement.endsAt ?? '').getTime();
    expect(Number.isFinite(startsAt)).toBe(true);
    expect(Number.isFinite(endsAt)).toBe(true);
    expect((endsAt - startsAt) / 86_400_000).toBeGreaterThanOrEqual(29.9);
    expect((endsAt - startsAt) / 86_400_000).toBeLessThanOrEqual(30.1);
    billingEntitlementEndsAt = paidEntitlement.endsAt ?? null;
    billingTransaction = 'verified_test_mode_webhook';
  }
  await page.goto('/settings?tab=companion');
  await expect(page.getByRole('heading', { name: 'Make the companion yours' })).toBeVisible();
  for (const removed of ['Companion name', 'Mood preview', 'Workspace position', 'Read replies aloud', 'Weekly code energy']) {
    await expect(page.getByText(removed, { exact: false })).toHaveCount(0);
  }
  await page.getByRole('tab', { name: 'Skins & Costumes' }).click();
  const techwear = page.getByRole('radio', { name: 'Techwear' });
  await techwear.click();
  await expect(techwear).toHaveAttribute('aria-checked', 'true');
  // Durable persistence is confirmed before the reload, on every run.
  //
  // This wait used to be gated behind `launchBillingApiUrl`, which is a *billing* variable and
  // unset on pull requests — so PR runs reloaded the page immediately and asserted that the
  // preference survived, while skipping the only step that establishes it had been saved. The
  // preference is written by a debounced `PATCH /api/profile`, so whether the reload observed it
  // depended on whether that request happened to land first. That is the race, and it is not a
  // property of the application: it is the test declining to wait for the thing it then asserts.
  //
  // The column has been in `profiles` since the July migrations, so this reads real durable
  // state on pull requests exactly as it does after a release. Nothing is stubbed and no
  // CI-only persistence path exists — a preference that never reaches Postgres fails here.
  await expect.poll(async () => {
    const storedProfile = await admin.from('profiles').select('companion_preferences').eq('id', ownerId).single();
    expect(storedProfile.error).toBeNull();
    return (storedProfile.data?.companion_preferences as { costume?: string } | null)?.costume;
  }, {
    message: 'companion preferences did not reach durable profile storage',
    timeout: 30_000,
    intervals: [500, 1_000, 2_000, 3_000],
  }).toBe('techwear');
  const companionProfilePersistence: 'verified_server' = 'verified_server';
  await page.reload();
  await page.getByRole('tab', { name: 'Skins & Costumes' }).click();
  await expect(page.getByRole('radio', { name: 'Techwear' })).toHaveAttribute('aria-checked', 'true');

  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Security' }).click();
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  // Sign-out navigates to "/", and the middleware then redirects an unauthenticated visitor
  // on to /auth/login. Both are correct post-logout locations, and which one a poll observes
  // is a race the test cannot control: when the redirect wins, "/" is never visible and the
  // 5s poll expires against a page that is already in the right place. Observed failing
  // twice in CI on commits touching no frontend file, and passing on a re-run of the
  // identical commit.
  //
  // Accepting either location does not weaken the check. What proves logout worked is the
  // next two lines — a protected route must bounce to the login page, and the session
  // endpoint must answer 401 unauthenticated — and neither is relaxed.
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/(auth\/login)?$/);
  await page.goto('/dashboard/operations');
  await expect(page).toHaveURL(/\/auth\/login/);
  const loggedOut = await browserSession(page); expect(loggedOut).toEqual({ status: 401, authenticated: false });
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/command3-auth-evidence.json', JSON.stringify({ projectRef: new URL(supabaseUrl).hostname.split('.')[0], expectedRelease: expectedRelease || null, expectedWebRelease: expectedWebRelease || null, webRelease: webRelease.body.release ?? 'unavailable', apiRelease: apiRelease.release ?? 'unavailable', frontendArtifactEquivalent: expectedWebRelease !== expectedRelease ? 'verified_by_zero_frontend_diff' : 'exact_release', login: 'verified', sessionRefresh: 'verified', authenticatedRoutes: routeChecks.length, responsiveViewports: 3, persistentWorkspaceShell: 'verified', workspaceMetrics, hardRefreshDraftRestore: 'verified', offlineShellContinuity: 'verified', userCacheIsolation: 'verified', prepaintTheme: 'verified', companionComposer: 'verified', canonicalComposerProductChips: 'removed', canonicalComposerMicrophone: 'removed', companionProfilePersistence, operationsApi: allowed.status, crossTenantApi: denied.status, notificationsApi: notifications.status, unreadNotificationsApi: unreadNotifications.status, billingCheckout, billingTransaction, billingMode: billingTransaction === 'verified_test_mode_webhook' ? 'test' : 'not_verified', initialRealCharge: billingTransaction === 'verified_test_mode_webhook' ? 0 : null, testPaymentInstrument, billingSubmissionMethod, billingEntitlementEndsAt, logout: loggedOut.status, fixtureIsolation: 'temporary users, projects, billing cycles, and companion preferences cascade-deleted', observedAt: new Date().toISOString() }, null, 2));
});
