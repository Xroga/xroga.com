'use client';

import { useMemo, useState } from 'react';
import { Layers3, MessageSquareText } from 'lucide-react';
import { XrogaOutputView } from '@/components/terminal/XrogaBlockView';
import { RICH_RESULT_FIXTURES } from '@/lib/xrogaRichResultFixtures';
import type { XrogaOutputDocument } from '@/lib/xrogaBlocks';
import type { XrogaRichResult } from '@/lib/xrogaRichResults';
import styles from './RichResultsGallery.module.css';

const CATEGORIES = ['all', 'transport', 'accommodation', 'shopping', 'reservation', 'vehicle', 'travel', 'business', 'other'] as const;
const PRESENTATIONS = ['grid', 'list', 'compact', 'horizontal', 'visual', 'editorial', 'ticket', 'comparison'] as const;
type Category = typeof CATEGORIES[number];
type Presentation = typeof PRESENTATIONS[number];

export function RichResultsGallery() {
  const [category, setCategory] = useState<Category>('all');
  const [presentation, setPresentation] = useState<Presentation>('grid');
  const [screen, setScreen] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [withoutImages, setWithoutImages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [comparison, setComparison] = useState(false);

  const output = useMemo<XrogaOutputDocument>(() => {
    let items: XrogaRichResult[] = category === 'all' ? RICH_RESULT_FIXTURES : RICH_RESULT_FIXTURES.filter((item) => item.domain === category);
    if (comparison) items = items.slice(0, 2);
    if (withoutImages) items = items.map((item) => ({ ...item, images: [] }));
    if (unavailable && items.length) items = items.map((item, index) => index === 0 ? { ...item, status: 'unavailable', demo: true, limitations: 'This is an unavailable demonstration result, not a live offer.' } : item);
    return {
      schemaVersion: 1, id: 'rich-answer-gallery', status: 'completed',
      blocks: [
        { schemaVersion: 1, id: 'gallery-narrative', type: 'narrative', text: `These ${items.length} results illustrate how a mixed Xroga answer keeps a short explanation alongside structured cards. Every item below is sample data, not a live provider result.` },
        { schemaVersion: 1, id: 'gallery-results', type: 'rich-results', title: category === 'all' ? 'Explore sample results' : `${category[0].toUpperCase() + category.slice(1)} examples`, description: 'Compare the information supplied, inspect limitations, and follow only genuine source links.', state: loading ? 'loading' : partial ? 'partial' : 'ready', presentation: comparison ? 'comparison' : presentation, items },
      ],
    };
  }, [category, presentation, withoutImages, loading, partial, unavailable, comparison]);

  return <div className={styles.page}>
    <section className={styles.hero}><span className={styles.kicker}>XROGA OS · RESPONSE LAB</span><h1>Answers worth exploring.</h1><p>One structured card engine for travel, shopping, places, services and everything between. Try the controls; the same renderer appears inside ordinary Xroga chat responses.</p><div className={styles.heroPills}><span><Layers3 size={14} /> {RICH_RESULT_FIXTURES.length} illustrative examples</span><span><MessageSquareText size={14} /> Real chat renderer</span></div></section>
    <div className="os-demo-banner">Demo experience — no real work or external changes are performed. No prices, availability, bookings or purchases on this page are live.</div>
    <section className={styles.lab} aria-label="Rich answer controls"><div className={styles.controls}>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((value) => <option key={value} value={value}>{value === 'all' ? 'All categories' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label>Presentation<select value={presentation} onChange={(event) => setPresentation(event.target.value as Presentation)}>{PRESENTATIONS.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label>Viewport<select value={screen} onChange={(event) => setScreen(event.target.value as typeof screen)}><option value="desktop">Desktop · 100%</option><option value="tablet">Tablet · 768px</option><option value="mobile">Mobile · 390px</option></select></label>
      <label>Theme<select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <div className={styles.toggles}>{([['withoutImages', 'Images missing', withoutImages, setWithoutImages], ['loading', 'Loading state', loading, setLoading], ['partial', 'Partial output', partial, setPartial], ['unavailable', 'Unavailable result', unavailable, setUnavailable], ['comparison', 'Two-item comparison', comparison, setComparison]] as const).map(([key, label, checked, setter]) => <label key={key}><input type="checkbox" checked={checked} onChange={(event) => setter(event.target.checked)} /> {label}</label>)}</div>
    </div>
    <div className={styles.canvas}><div className={`${styles.viewport} ${styles[screen]} ${styles[theme]}`}><div className={styles.chatHeader}><span className={styles.avatar}>X</span><div><strong>Xroga AI</strong><small>Sample rich answer · not a live search</small></div></div><XrogaOutputView output={output} /></div></div>
    </section>
    <p className={styles.note}>The gallery uses isolated fixtures. Real chat only renders validated structured data from its existing message pipeline; missing provider data remains missing.</p>
  </div>;
}
