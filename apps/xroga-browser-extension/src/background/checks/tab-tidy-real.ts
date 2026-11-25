// Real-time proof of the tab tidy: a tab the agent opened is closed by the real alarm after the real 45 minutes of idle time.
// Not part of any suite: run it by name with a long timeout, e.g. `node fixtures/autorun.mjs tab-tidy-real-idle --timeout 4200`.
// The tab in front and a tab the person opened must still be there at the end.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';

defineCheck({
  name: 'tab-tidy-real-idle',
  title: 'the agent tab is closed by the alarm after a real 45-minute idle',
  description: 'Opens a tab through the layer, waits in real time (no clock shortcut) until the alarm closes it; the front tab and the person tab stay.',
  async run() {
    const { installTabTidy, IDLE_MS, ALARM } = await import('../../extension/tab-tidy');
    installTabTidy(async () => false);
    const base = await chrome.tabs.create({ url: `${FIXTURE_ORIGIN}/c-text.html`, active: true });
    await waitForLoad(base.id!);
    const mine = await chrome.tabs.create({ url: `${FIXTURE_ORIGIN}/c-text.html`, active: false });
    const { trackAgentTab } = await import('../../extension/tab-tidy');
    const agent = await chrome.tabs.create({ url: `${FIXTURE_ORIGIN}/c-audit-page.html`, active: false });
    await trackAgentTab(agent.id!, true);
    await chrome.tabs.update(base.id!, { active: true });
    const started = Date.now();
    const alarm = await chrome.alarms.get(ALARM);
    let closedAt: number | undefined;
    // Every poll is an extension call, which keeps the worker from being suspended while the test waits.
    while (Date.now() - started < IDLE_MS + 20 * 60_000) {
      await sleep(20_000);
      const still = await chrome.tabs.get(agent.id!).catch(() => undefined);
      if (!still) {
        closedAt = Date.now();
        break;
      }
    }
    const minutes = closedAt ? Math.round(((closedAt - started) / 60_000) * 10) / 10 : undefined;
    const frontAlive = !!(await chrome.tabs.get(base.id!).catch(() => undefined));
    const mineAlive = !!(await chrome.tabs.get(mine.id!).catch(() => undefined));
    await chrome.tabs.remove([base.id!, mine.id!]).catch(() => undefined);
    const report = { alarmPeriodMinutes: alarm?.periodInMinutes, closedAfterMinutes: minutes, frontAlive, mineAlive };
    if (!(minutes !== undefined && minutes >= 45 && minutes <= 60 && frontAlive && mineAlive)) throw new Error(JSON.stringify(report));
    return report;
  },
});
