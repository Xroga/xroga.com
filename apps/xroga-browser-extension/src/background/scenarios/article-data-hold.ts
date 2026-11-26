// read with format article keeps only the story, read with format data returns what the page publishes about itself,
// and click with holdMs keeps the button down (a hold-to-reveal control).
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-article-data-hold',
  set: 'C',
  title: 'article text without menus or ads, structured data and contacts, and press-and-hold',
  covers: 'read article drops the menu, the sponsored box and the trending list and keeps headings, list, table, link and code; read data lists JSON-LD, Open Graph, microdata, emails, phones, social profiles and feeds; a plain click of a hold button releases early, click with holdMs reveals the code',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/article-news.html`);
    await sleep(300);
    const article = (await ctx.call('read', { format: 'article' })) as Result;
    const data = (await ctx.call('read', { format: 'data' })) as Result;
    const a = article.text ?? '';
    const d = data.text ?? '';
    const holdTab = await ctx.open(`${FIXTURE_ORIGIN}/hold-button.html`);
    await sleep(300);
    const quick = (await ctx.call('click', { target: { role: 'button', name: 'Hold to reveal' } })) as Result;
    const early = await evaluate<string>(holdTab, undefined, "document.getElementById('state').textContent");
    const held = (await ctx.call('click', { target: { role: 'button', name: 'Hold to reveal' }, holdMs: 1400 })) as Result;
    const revealed = await evaluate<string>(holdTab, undefined, "document.getElementById('state').textContent");
    void tabId;
    const articleOk =
      /4\.2 metres/.test(a) && /^## What changed|\n## What changed/m.test(a) && /- East wall: 14 berths/.test(a) && /\| Under 8 m \| 18 euros \| 310 euros \|/.test(a) &&
      /\[harbour board report\]\(https:\/\/gazette\.example\/harbour-board-report\)/.test(a) && /Booking code format: QUAY-YYYY-NNN/.test(a) &&
      !/SPONSORED|Trending|Subscribe now|Ten cheap flights/.test(a);
    const dataOk =
      /NewsArticle/.test(d) && /Mira Okonkwo/.test(d) && /og:title: Harbor Tides/.test(d) && /harbour@gazette\.example/.test(d) && /newsroom@gazette\.example/.test(d) &&
      /\+44 20 7946 0958/.test(d) && /x: https:\/\/x\.com\/coastalgazette/.test(d) && /facebook: https:\/\/www\.facebook\.com\/coastalgazette/.test(d) &&
      /linkedin: https:\/\/www\.linkedin\.com\/company\/coastal-gazette/.test(d) && !/intent\/tweet/.test(d) && /feed\.xml/.test(d) && /Organization/.test(d);
    return outcome(
      'article keeps the story and drops the menu and ads; data lists json-ld, open graph, contacts, social profiles and the feed; a quick click releases early and a held click reveals the code',
      JSON.stringify({ article: a.slice(0, 700), data: d.slice(0, 1500), quick: quick.ok, early, held: held.ok, revealed }),
      articleOk && dataOk && !!quick.ok && /released early/.test(early) && !!held.ok && /revealed 4821/.test(revealed),
    );
  },
});
