// Postconditions that count: "the list has this many rows" and "a row with this name is there", checked after a click on a real page.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

const post = (r: { receipt?: { postcondition?: { status: string; detail?: string } } }) => r.receipt?.postcondition;

defineScenario({
  id: 'S3-expect-count',
  set: 'C',
  title: 'click "Add a row" with a count postcondition, met and unmet, and an exists postcondition',
  covers: 'count and exists are checked on a fresh look at the whole page, and a wrong expectation says what the page had',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-effects.html`);
    await ctx.call('snapshot');
    const add = { target: { role: 'button', name: 'Add a row' } };
    const first = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', equals: 1 } } });
    const second = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', equals: 1 } } });
    const third = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', atLeast: 3, atMost: 3 }, exists: { role: 'listitem', name: 'Row 3' } } });
    const fourth = await ctx.call('click', { ...add, expect: { exists: { role: 'listitem', name: 'Row 99' } } });
    const p = [post(first), post(second), post(third), post(fourth)];
    const met = (i: number) => p[i]?.status === 'met';
    const unmetWith = (i: number, text: string) => p[i]?.status === 'unmet' && (p[i]?.detail ?? '').includes(text);
    return outcome(
      'row 1 met, row 2 unmet with "the page has 2 listitem, not 1", row 3 met by count and exists, row 4 unmet with "no listitem"',
      JSON.stringify(p),
      met(0) && unmetWith(1, 'the page has 2 listitem, not 1') && met(2) && unmetWith(3, 'there is no listitem "Row 99"'),
    );
  },
});

// Port of Browser Agent's list_count_delta (uiuing/browser-agent @ a8517e2c, MIT, packages/extension/src/engine/page/verify.ts): a model that does not know
// how many rows the list has can still say "it gained one".
defineScenario({
  id: 'S3-expect-count-delta',
  set: 'C',
  title: 'click "Add a row" with a count.delta postcondition: gained one (met), gained none (unmet), wrong sign (unmet)',
  covers: 'the count is taken before the action and the change is judged against it, with the page, not the model, supplying the baseline',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-effects.html`);
    await ctx.call('snapshot');
    const add = { target: { role: 'button', name: 'Add a row' } };
    const gained = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', delta: 1 } } });
    const none = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', delta: 0 } } });
    const lost = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', delta: -1 } } });
    const p = [post(gained), post(none), post(lost)];
    return outcome(
      'gain of 1 met; delta 0 and -1 unmet saying the change was 1',
      JSON.stringify(p),
      p[0]?.status === 'met' && p[1]?.status === 'unmet' && (p[1]?.detail ?? '').includes('a change of 1, not 0') && p[2]?.status === 'unmet',
    );
  },
});

// Port in idea of FSB's reactive triggers (fullselfbrowsing/FSB @ 28284b8c, MIT): wait until a target READS something, instead of polling with fixed sleeps.
defineScenario({
  id: 'S3-wait-reading',
  set: 'C',
  title: 'wait until a progress figure is above 60, a status contains "finish", and a figure changed; and time out saying what it read',
  covers: 'wait on the value of an element the page updates by itself, with the reading in the timeout message',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-ticker.html`);
    const snap = await ctx.call('snapshot');
    const plain = await ctx.call('wait', { target: { role: 'textbox', name: 'Progress' }, timeoutMs: 1000 });
    const above = await ctx.call('wait', { target: { role: 'textbox', name: 'Progress' }, reading: { above: 60 }, timeoutMs: 4000 });
    const state = await ctx.call('wait', { target: { role: 'button', name: 'State' }, reading: { contains: 'finish' }, timeoutMs: 4000 });
    const never = await ctx.call('wait', { target: { role: 'textbox', name: 'Progress' }, reading: { below: 5 }, timeoutMs: 600 });
    return outcome(
      'above 60 met, state contains finish met, below 5 times out saying it reads 100',
      JSON.stringify({ above: above.ok, state: state.ok, never: never.ok, why: never.error?.message?.slice(0, 120), snap: snap.text.slice(-300), aboveErr: above.error?.message?.slice(0, 160), plain: plain.ok, plainErr: plain.error?.message?.slice(0, 160) }),
      above.ok && state.ok && !never.ok && /reads 100, not below 5/.test(never.error?.message ?? ''),
    );
  },
});

// Port of Browser Agent's element_state postcondition (uiuing/browser-agent @ a8517e2c, MIT, verify.ts), as `enabled`: a button that locks after sending is proof the send happened.
defineScenario({
  id: 'S3-expect-enabled',
  set: 'C',
  title: 'click "Send once" expecting it to be disabled afterwards (met), and a button that stays enabled with the same expectation (unmet)',
  covers: 'the enabled postcondition reads the target after the action and says what it found',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-enabled.html`);
    await ctx.call('snapshot');
    const locked = await ctx.call('click', { target: { role: 'button', name: 'Send once' }, expect: { enabled: false } });
    const stays = await ctx.call('click', { target: { role: 'button', name: 'Do nothing' }, expect: { enabled: false } });
    const p = [post(locked), post(stays)];
    return outcome(
      'Send once met (disabled); Do nothing unmet saying the target is enabled',
      JSON.stringify(p),
      p[0]?.status === 'met' && p[1]?.status === 'unmet' && (p[1]?.detail ?? '').includes('the target is enabled'),
    );
  },
});

// Port of Browser Agent's attribute_equals (uiuing/browser-agent @ a8517e2c, MIT, verify.ts): a menu button that now says aria-expanded="true" proves the menu opened.
defineScenario({
  id: 'S3-expect-attribute',
  set: 'C',
  title: 'click "Open menu" expecting aria-expanded true (met), and a button without the attribute with the same expectation (unmet)',
  covers: 'the attribute postcondition reads the target after the action and says what it found',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-enabled.html`);
    await ctx.call('snapshot');
    const opened = await ctx.call('click', { target: { role: 'button', name: 'Open menu' }, expect: { attribute: 'aria-expanded=true' } });
    const plain = await ctx.call('click', { target: { role: 'button', name: 'Do nothing' }, expect: { attribute: 'aria-expanded=true' } });
    const p = [post(opened), post(plain)];
    return outcome(
      'Open menu met; Do nothing unmet saying aria-expanded is not set',
      JSON.stringify(p),
      p[0]?.status === 'met' && p[1]?.status === 'unmet' && (p[1]?.detail ?? '').includes('aria-expanded is not set'),
    );
  },
});


// Hover-revealed controls (seen in a competitor's webmail run: "opening the draft away from hover controls"): the row shows a Delete button over its middle once the pointer is on it.
// A click at the centre would press that button; the click must open the row instead, and the receipt must say where it went.
defineScenario({
  id: 'S3-click-clear-of-hover-controls',
  set: 'C',
  title: 'click a list row whose Delete button appears over its middle on hover: the row opens, nothing is deleted',
  covers: 'after the pointer is over the click point, a separate control that now covers it moves the click to another point inside the target',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-hover-actions.html`);
    const snap = await ctx.call('snapshot');
    const ref = /\[(\w+)\][^\n]*ana@example\.test/.exec(String((snap as { text?: string }).text ?? ''))?.[1] ?? 'none';
    const r = await ctx.call('click', { target: { ref } });
    const status = await ctx.call('find', { role: 'status' });
    const text = `${r.text ?? ''} ${(status as { text?: string }).text ?? ''}`;
    const pageText = JSON.stringify(await ctx.call('read', {}));
    return outcome(
      'the row opened (Opened Ana) and the Delete button was not pressed (no Deleted Ana); the result names the move',
      `${text.slice(0, 300)} | ${/Opened Ana/.test(pageText) ? 'opened' : 'not opened'} | ${/Deleted Ana/.test(pageText) ? 'DELETED' : 'not deleted'}`,
      /Opened Ana/.test(pageText) && !/Deleted Ana/.test(pageText),
    );
  },
});

// A value typed into a field is on the page, yet innerText never holds it: a plan milestone whose check is an email address or a saved sentence cost a live run seven bookkeeping turns.
defineScenario({
  id: 'S3-wait-text-sees-field-values',
  set: 'C',
  title: 'wait for text that only exists as a field value (and with the sentence full stop kept): met; the same text as "gone" and a password field: not seen',
  covers: 'a positive text check also reads input and textarea values (never passwords), and ignores a trailing full stop quoted from a sentence',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-field-text.html`);
    await ctx.call('snapshot');
    const tryWait = async (args: Record<string, unknown>) => {
      try { return (await ctx.call('wait', { timeoutMs: 400, ...args })).ok ? 'met' : 'unmet'; } catch { return 'unmet'; }
    };
    const email = await tryWait({ text: 'hello@field.example.test' });
    const dotted = await tryWait({ text: 'hello@field.example.test.' });
    const note = await tryWait({ text: 'call 555 0142' });
    const secret = await tryWait({ text: 'hunter2-secret' });
    const goneStillThere = await tryWait({ textGone: 'hello@field.example.test' });
    return outcome(
      'email met, dotted email met, note met, password unmet, textGone on a field value met (fields are not read for gone)',
      JSON.stringify({ email, dotted, note, secret, goneStillThere }),
      email === 'met' && dotted === 'met' && note === 'met' && secret === 'unmet' && goneStillThere === 'met',
    );
  },
});

// A typeahead takes three calls by hand (type, wait for the list, click the suggestion); fill_form's `pick` does it inside one call, and an ambiguous or missing suggestion is refused with what is offered.
defineScenario({
  id: 'S3-fill-form-picks-typeahead-suggestion',
  set: 'C',
  title: 'fill_form types a name and a search, then picks the exact suggestion in one call; an ambiguous pick is refused',
  covers: 'a field with pick clicks the named suggestion once the list has arrived, and says what is offered when the name is ambiguous',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-typeahead.html`);
    await ctx.call('snapshot');
    const ok = await ctx.call('fill_form', { fields: [{ target: { role: 'textbox', name: 'Name' }, value: 'Grace' }, { target: { role: 'combobox', name: 'Interest' }, value: 'Small business owners', pick: true }] });
    const chosen = JSON.stringify(await ctx.call('read', {}));
    const bad = await ctx.call('fill_form', { fields: [{ target: { role: 'combobox', name: 'Interest' }, value: 'Small business', pick: true }] });
    // Without pick: a combobox whose exactly named suggestion appears is picked anyway; free text with no such suggestion stays as typed.
    await ctx.call('navigate', { action: 'reload' });
    await ctx.call('snapshot');
    const auto = await ctx.call('fill_form', { fields: [{ target: { role: 'combobox', name: 'Interest' }, value: 'Entrepreneurship' }] });
    const autoRead = JSON.stringify(await ctx.call('read', {}));
    const free = await ctx.call('fill_form', { fields: [{ target: { role: 'combobox', name: 'Interest' }, value: 'zzz free text' }] });
    return outcome(
      'one call set the name and picked "Small business owners"; the vague pick was refused',
      JSON.stringify({ ok: ok.ok, okWhy: ok.error?.message?.slice(0, 300), chosen: chosen.slice(0, 300), bad: bad.ok, why: bad.error?.message?.slice(0, 160) }),
      ok.ok === true && /Small business owners[\s\S]*Small business owners/.test(chosen) && bad.ok === false && auto.ok === true && /Entrepreneurship[\s\S]*Entrepreneurship/.test(autoRead) && free.ok === true,
    );
  },
});

// "The Nth Delete button" is a position: after a re-order it removes another record. A destructive control picked by nth among identical ones is refused with each match's row; a harmless one still accepts nth.
defineScenario({
  id: 'S3-nth-delete-among-twins-is-refused',
  set: 'C',
  title: 'delete picked by nth among two identical Delete draft buttons is refused and lists the rows; Open by nth still works',
  covers: 'a destructive control chosen only by position is refused with the row of each match; a non-destructive control still accepts nth',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-two-deletes.html`);
    await ctx.call('snapshot');
    const refused = await ctx.call('click', { target: { role: 'button', name: 'Delete draft', nth: 0 } });
    const open = await ctx.call('click', { target: { role: 'button', name: 'Open', nth: 1 } });
    const rows = JSON.stringify(await ctx.call('read', {}));
    return outcome(
      'delete by nth refused naming both rows and nothing deleted; Open nth 1 worked',
      JSON.stringify({ refused: refused.ok, why: refused.error?.message?.slice(0, 260), open: open.ok, stillBoth: /ana@x\.test/.test(rows) && /carla@x\.test/.test(rows) }),
      refused.ok === false && /ana@x\.test/.test(refused.error?.message ?? '') && /carla@x\.test/.test(refused.error?.message ?? '') && open.ok === true && /ana@x\.test/.test(rows) && /carla@x\.test/.test(rows),
    );
  },
});

