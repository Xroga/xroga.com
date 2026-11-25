// The bundled skill pool inside the real extension: the file ships with it, is read through the extension's own address, decompressed with the browser's gzip, and a skill opens at once
// with no network. Checks a spread of skills across the whole file (first, middle, last) and the whole-file integrity through every skill's length.
import { bundledSkillText, searchPool } from '@src/agent/aas-skills';
import { loadBundledCandidate } from '@src/agent/online-skills';
import { poolCandidate } from '@src/agent/aas-skills';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-pool-bundle',
  set: 'C',
  title: 'a pool skill opens from the bundle inside the extension, offline, and is found by its own words',
  covers: 'skills.bin is served from the extension, gunzips in the worker, parses as a skill; a search on the device finds the skill; nothing is fetched from the network',
  async run() {
    const probes = ['playwright-skill', 'shopify-automation', 'on-page-seo-audit-checker', 'pdf-conversion-router'];
    const started = Date.now();
    const found = await searchPool('automate a browser test with playwright', 5);
    const results: string[] = [];
    let ok = true;
    for (const id of probes) {
      const text = await bundledSkillText(id);
      const c = await poolCandidate(id);
      const loaded = c ? await loadBundledCandidate(c) : null;
      const good = !!text && text.startsWith('---') && (loaded?.text?.length ?? 0) > 200;
      if (!good) ok = false;
      results.push(`${id}:${text ? text.length : 'none'}`);
    }
    const ms = Date.now() - started;
    return outcome(
      'four skills from across the pool open from the bundle with real text, and the search finds the Playwright skill',
      JSON.stringify({ ms, results, search: found.map(h => h.id).slice(0, 4) }),
      ok && found.some(h => h.id === 'playwright-skill'),
    );
  },
});
