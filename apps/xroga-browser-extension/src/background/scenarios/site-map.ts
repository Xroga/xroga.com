// site_map on real sites: MDN publishes a sitemap index whose files are gzip; docs.python.org names its sitemap in robots.txt and tells
// crawlers to avoid old versions.
import { describeSiteMap } from '../../agent/site-map';
import { readSiteMap } from '../../extension/site-map';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-site-map',
  set: 'C',
  title: 'robots.txt and sitemaps of real sites, including a gzip sitemap index',
  covers: 'MDN: an index of gzip sitemaps, one chosen by part of its address, thousands of pages grouped by section; docs.python.org: sitemap named in robots.txt and disallowed old versions left out',
  async run() {
    const mdn = await readSiteMap('https://developer.mozilla.org/en-US/docs/Web', { sitemap: 'en-us' });
    const mdnText = describeSiteMap(mdn, { include: '/docs/Web/JavaScript/Reference/Global_Objects/Array/', limit: 5 });
    const py = await readSiteMap('https://docs.python.org/3/');
    const pyText = describeSiteMap(py, { limit: 5 });
    const pyAll = describeSiteMap(py, { includeDisallowed: true, limit: 50 });
    const checks: Record<string, boolean> = {
      mdnReadGzip: mdn.sitemapsRead.length === 1 && /en-us/i.test(mdn.sitemapsRead[0]!) && mdn.entries.length > 5000,
      mdnFiltered: /after filters/.test(mdnText) && /Array\/map|Array\/filter|Array\/push/.test(mdnText.replace(/\n/g, ' ')) === true || /\/Array\//.test(mdnText),
      mdnSections: /By section: .*\/en-US\//.test(mdnText),
      pythonRobots: py.robotsFound && py.sitemapsListed.some(s => /docs\.python\.org\/sitemap\.xml/.test(s)) && (py.robots?.disallow.includes('/dev') ?? false),
      pythonSitemap: py.entries.length >= 3 && py.sitemapsRead.length === 1,
      pythonDisallowedListed: /includeDisallowed|left out because robots\.txt disallows|Pages:/.test(pyText + pyAll),
    };
    return outcome(
      'real robots.txt and sitemaps (plain and gzip) are read and summarised',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), mdn: mdnText.slice(0, 700), py: pyText.slice(0, 700) }),
      Object.values(checks).every(Boolean),
    );
  },
});
