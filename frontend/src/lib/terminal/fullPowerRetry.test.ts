import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Cover for "Use full power now".
 *
 * Some people are fine waiting for the daily unlock; others said directly they want
 * full power and do not want to see "Next unlock: Aug 3, 3:42 PM" stop them. The fix
 * keeps that line — it stays true and useful for the people who are fine waiting — and
 * adds a second, real option next to it: switch to Full Power pacing (unlocks the rest
 * of the month's capacity immediately) and resume the exact build that was refused.
 *
 * These are source-shape assertions, matching this codebase's existing convention for
 * component wiring (see plainResponseUi.test.ts) rather than a rendered-DOM test, since
 * no React Testing Library setup exists here.
 */

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

test('the capacity card is wired into the message log, next to the stopped-build card', () => {
  const messageLog = source('../../components/terminal/SwarmMessageLog.tsx');
  assert.match(messageLog, /msg\.capacityUnavailable \? \(/);
  assert.match(messageLog, /<CapacityUnavailableCard/);
  assert.match(messageLog, /onUseFullPower=\{\(\) => retryWithFullPower\(msg\.id\)\}/);
});

test('the card keeps the next-unlock line and adds a real second option', () => {
  const card = source('../../components/terminal/CapacityUnavailableCard.tsx');
  assert.match(card, /More unlocks/);
  assert.match(card, /Use full power now/i);
  // The trade-off sits directly under the button it describes, not in a separate
  // dialog or a footnote nobody reads before clicking.
  assert.match(card, /may mean less is available before the[\s\S]{0,20}month renews/i);
});

test('the card never states a dollar amount', () => {
  const card = source('../../components/terminal/CapacityUnavailableCard.tsx');
  assert.doesNotMatch(card, /\$\d|USD/);
});

test('confirming the switch is the click itself, not a second prompt the user has to click through', () => {
  // The context handler passes confirmed: true — the card already states the trade-off
  // before the button is shown, so a second confirm() dialog would just be friction
  // restating what the user already read.
  const context = source('../../context/TerminalChatContext.tsx');
  const handler = context.slice(context.indexOf('const retryWithFullPower'));
  const body = handler.slice(0, handler.indexOf('\n  }, [messages]);') + 20);
  assert.match(body, /setPacing\('full_access', true\)/);
});

test('switching resends the exact prompt that was refused, not a fresh compose', () => {
  const context = source('../../context/TerminalChatContext.tsx');
  const handler = context.slice(context.indexOf('const retryWithFullPower'));
  const body = handler.slice(0, handler.indexOf('\n  }, [messages]);') + 20);
  assert.match(body, /submitRef\.current\(original, false, false\)/);
});

test('a failed pacing switch is reported and does not silently resend anyway', () => {
  const context = source('../../context/TerminalChatContext.tsx');
  const handler = context.slice(context.indexOf('const retryWithFullPower'));
  const body = handler.slice(0, handler.indexOf('\n  }, [messages]);') + 20);
  const catchBlock = body.slice(body.indexOf('catch {'), body.indexOf('catch {') + 160);
  assert.match(catchBlock, /toast\.error/);
  assert.match(catchBlock, /return;/);
});
