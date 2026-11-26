// `emulate`: the open tab shown as a phone, in dark mode with reduced motion, in another time zone and language, offline, and then reset to normal.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-emulate',
  set: 'C',
  title: 'emulate shows the page as an iPhone in dark mode with reduced motion and another time zone, cuts the connection, and reset restores everything',
  covers: 'viewport and media queries respond; offline makes a fetch fail; reset clears viewport, scheme, motion, zone and network',
  async run(ctx) {
    // The page reacts on its next frame, which a background tab may be slow to draw: read again until the text shows the change (at most 6 s).
    const until = async (pattern: RegExp) => {
      let text = '';
      for (let i = 0; i < 12; i++) {
        text = (await ctx.call('read', {})).text;
        if (pattern.test(text)) break;
        await new Promise(r => setTimeout(r, 500));
      }
      return text;
    };
    await ctx.open(`${FIXTURE_ORIGIN}/c-emulate.html`);
    const before = (await ctx.call('read', {})).text;
    // The scheme the browser starts with depends on the machine's own setting: reset must bring back that one.
    const baseScheme = /scheme (light|dark) · motion normal/.exec(before)?.[1] ?? '';
    const phone = await ctx.call('emulate', { device: 'iphone-15', colorScheme: 'dark', reducedMotion: true, timezone: 'Asia/Tokyo', locale: 'de-DE' });
    const during = await until(/width 393/);
    const off = await ctx.call('emulate', { network: 'offline' });
    await ctx.call('click', { target: { role: 'button', name: 'Check connection' } });
    const offline = await until(/connection failed/);
    const reset = await ctx.call('emulate', { reset: true });
    await until(/width (?!393)\d+/);
    await ctx.call('click', { target: { role: 'button', name: 'Check connection' } });
    const after = await until(/connection ok/);
    const empty = await ctx.call('emulate', {});
    return outcome(
      'width 393, dark, reduced motion, Asia/Tokyo and de-DE while emulated; connection failed offline; after reset a different width, the starting scheme, normal motion and the connection ok',
      JSON.stringify({ reset: reset.text.slice(0, 400), phone: phone.text.slice(0, 300), before: before.split('\n').filter(l => /^width|^connection/.test(l)), during: during.split('\n').filter(l => /^width|^connection/.test(l)), offline: offline.split('\n').filter(l => /^width|^connection/.test(l)), after: after.split('\n').filter(l => /^width|^connection/.test(l)) }),
      phone.ok && off.ok && reset.ok &&
        /width 393 · layout narrow · scheme dark · motion reduced · zone Asia\/Tokyo · language de-DE/.test(during) && /layout narrow/.test(during) &&
        /connection failed/.test(offline) &&
        !/width 393/.test(after) && after.includes(`scheme ${baseScheme} · motion normal`) && /connection ok/.test(after) &&
        /nothing to change/.test(empty.text) &&
        baseScheme !== '',
    );
  },
});
