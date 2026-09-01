import Image from 'next/image';

const intelligenceCards = [
  {
    id: '01',
    layout: 'wide',
    image: '/homepage/intelligence/xroga-unified-intelligence-20260901.png',
    width: 1448,
    height: 1086,
    alt: 'Xroga unified intelligence connecting product understanding, planning, code, and release',
    kicker: 'UNIFIED BUILD INTELLIGENCE',
    title: 'One intelligence across the whole build.',
    copy: 'Black Hole V∞ interprets the brief, selects a suitable reasoning depth, and coordinates planning, coding, verification, and handoff inside one Xroga workspace.',
    signals: ['Understand', 'Plan', 'Build', 'Verify'],
  },
  {
    id: '02',
    layout: 'standard',
    image: '/homepage/intelligence/xroga-visible-verification-20260901.png',
    width: 1448,
    height: 1086,
    alt: 'Xroga verification system connecting code changes, checks, and approval evidence',
    kicker: 'VISIBLE VERIFICATION',
    title: 'Proof stays visible.',
    copy: 'Review changed files, checks, blockers, and preview evidence before Xroga prepares a release.',
    signals: ['Diffs', 'Checks', 'Evidence'],
  },
  {
    id: '03',
    layout: 'standard',
    image: '/homepage/intelligence/xroga-authorized-execution-20260901.png',
    width: 1192,
    height: 1320,
    alt: 'Xroga carrying an approved task through planning, code, and a verified release',
    kicker: 'AUTHORIZED EXECUTION',
    title: 'Execution follows your permission.',
    copy: 'Xroga works through connected tools and accounts only when you authorize the consequential action.',
    signals: ['Tools', 'Accounts', 'Approval'],
  },
] as const;

const capabilities = [
  'Deep Reasoning',
  '1M+ Context',
  'Multimodal',
  'Advanced Coding',
  'Agentic',
  'Structured Output',
  'Long-Horizon',
] as const;

export function XrogaIntelligenceSection() {
  return (
    <section className="xv-intelligence" aria-labelledby="xroga-intelligence-heading">
      <div className="xv-intelligence-bento">
        <header className="xv-intelligence-bento__header">
          <p>BLACK HOLE V∞ · XROGA INTELLIGENCE</p>
          <h2 id="xroga-intelligence-heading">
            Intelligence that does more than <em>answer.</em>
          </h2>
          <span>Xroga connects reasoning to software work you can inspect, judge, and own.</span>
        </header>

        <div className="xv-intelligence-bento__grid">
          {intelligenceCards.map((card) => (
            <article
              key={card.id}
              className="xv-intelligence-panel"
              data-layout={card.layout}
            >
              <div className="xv-intelligence-panel__visual">
                <Image
                  src={card.image}
                  alt={card.alt}
                  width={card.width}
                  height={card.height}
                  sizes={card.layout === 'wide'
                    ? '(max-width: 760px) 92vw, (max-width: 1100px) 58vw, 620px'
                    : '(max-width: 760px) 92vw, (max-width: 1100px) 44vw, 440px'}
                />
              </div>

              <div className="xv-intelligence-panel__copy">
                <p><span>{card.id}</span>{card.kicker}</p>
                <h3>{card.title}</h3>
                <span>{card.copy}</span>
                <ul aria-label={`${card.title} system stages`}>
                  {card.signals.map((signal) => <li key={signal}>{signal}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <ul className="xv-intelligence-bento__capabilities" aria-label="Black Hole Infinity capabilities">
          {capabilities.map((capability) => <li key={capability}>{capability}</li>)}
        </ul>
      </div>
    </section>
  );
}
