import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Braces,
  CheckCircle2,
  Database,
  GitBranch,
  Globe2,
  Layers3,
  Radar,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';

import styles from './crypto-seo.module.css';

const DEV_STEPS = [
  {
    icon: Blocks,
    title: 'Start with the product',
    copy: 'Describe the users, workflow, screens, data and blockchain requirements you actually need.',
  },
  {
    icon: GitBranch,
    title: 'Build in a real repository',
    copy: 'Create a supported project or continue from existing code without hiding the implementation in a closed editor.',
  },
  {
    icon: Workflow,
    title: 'Connect the full application',
    copy: 'Keep the interface, APIs, data and authorized integrations attached to the same product state.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify before release',
    copy: 'Run the applicable project checks and surface blockers instead of treating generation itself as proof.',
  },
] as const;

const PRODUCT_CARDS = [
  {
    icon: BarChart3,
    eyebrow: 'AI DASHBOARD BUILDER',
    title: 'DeFi & crypto analytics',
    copy:
      'Build wallet activity, protocol, token and on-chain dashboards around supported public or authorized data sources.',
    items: ['Wallet activity', 'Protocol analytics', 'On-chain monitoring'],
    href: '#builder',
    cta: 'Build a crypto dashboard',
  },
  {
    icon: Database,
    eyebrow: 'AI SAAS BUILDER',
    title: 'Crypto SaaS products',
    copy:
      'Create account-based research tools, analytics workspaces, monitoring products and other supported crypto SaaS workflows.',
    items: ['Research SaaS', 'Wallet intelligence', 'DAO software'],
    href: '/build-saas-with-ai',
    cta: 'Explore SaaS building',
  },
  {
    icon: Globe2,
    eyebrow: 'WEB3 WEBSITE BUILDER',
    title: 'Web3 sites + the product behind them',
    copy:
      'Launch a crypto or blockchain website, then keep building the application, APIs and dashboard behind the public-facing experience.',
    items: ['Crypto project sites', 'DeFi websites', 'Web3 landing pages'],
    href: '/ai-website-builder',
    cta: 'Explore website building',
  },
] as const;

function RepoFolderVisual() {
  return (
    <div className={styles.folderVisual} aria-hidden="true">
      <div className={styles.folderGlow} />
      <div className={[styles.repoSheet, styles.repoSheetThree].join(' ')}>
        <span>api/route.ts</span><i /><i /><i />
      </div>
      <div className={[styles.repoSheet, styles.repoSheetTwo].join(' ')}>
        <span>dashboard.tsx</span><i /><i /><i />
      </div>
      <div className={[styles.repoSheet, styles.repoSheetOne].join(' ')}>
        <span>app/page.tsx</span><i /><i /><i />
      </div>
      <div className={styles.folderBack} />
      <div className={styles.folderFront}>
        <div><GitBranch /><span>your-repo</span></div>
        <strong>03 files changed</strong>
      </div>
    </div>
  );
}

function DevTreeVisual() {
  const rows = [
    ['01', 'Brief', 'product intent'],
    ['02', 'Repository', 'existing or new'],
    ['03', 'Build', 'UI · API · data'],
    ['04', 'Verify', 'checks · preview'],
  ] as const;

  return (
    <div className={styles.devTree} aria-hidden="true">
      <div className={styles.treeRail} />
      {rows.map(([n, title, meta]) => (
        <div className={styles.treeRow} key={n}>
          <span className={styles.treeNode}>{n}</span>
          <div><strong>{title}</strong><small>{meta}</small></div>
        </div>
      ))}
    </div>
  );
}

function DashboardVisual() {
  return (
    <div className={styles.dashboardVisual} aria-hidden="true">
      <div className={styles.dashboardTop}>
        <span>WALLET ANALYTICS</span><small>PRODUCT UI</small>
      </div>
      <div className={styles.metricRow}>
        <div><small>Activity</small><strong>Indexed</strong></div>
        <div><small>Source</small><strong>Verified</strong></div>
      </div>
      <div className={styles.chartGrid}>
        <svg viewBox="0 0 360 120" preserveAspectRatio="none">
          <path
            className={styles.chartArea}
            d="M0,104 C35,94 48,78 76,82 C110,87 126,42 160,54 C190,66 211,28 244,42 C273,54 304,17 360,25 L360,120 L0,120 Z"
          />
          <path
            className={styles.chartLine}
            d="M0,104 C35,94 48,78 76,82 C110,87 126,42 160,54 C190,66 211,28 244,42 C273,54 304,17 360,25"
          />
        </svg>
      </div>
    </div>
  );
}

function TerminalVisual() {
  return (
    <div className={styles.terminalVisual} aria-hidden="true">
      <div className={styles.terminalHeader}>
        <span /><span /><span /><small>verification</small>
      </div>
      <div className={styles.terminalBody}>
        <p><b>›</b> npm run build</p>
        <p><CheckCircle2 /> typecheck passed</p>
        <p><CheckCircle2 /> production build passed</p>
        <p><CheckCircle2 /> preview reachable</p>
        <strong>READY FOR REVIEW<span>_</span></strong>
      </div>
    </div>
  );
}

function ProductVisual({ index }: { index: number }) {
  if (index === 0) return <DashboardVisual />;

  if (index === 1) {
    return (
      <div className={styles.stackVisual} aria-hidden="true">
        <div><Database /><span>accounts</span></div>
        <div><Layers3 /><span>application</span></div>
        <div><Radar /><span>data + alerts</span></div>
      </div>
    );
  }

  return (
    <div className={styles.webVisual} aria-hidden="true">
      <div className={styles.browserBar}><i /><i /><i /><span>xroga.app</span></div>
      <div className={styles.webHeroLine} />
      <div className={styles.webContent}><span /><span /><span /></div>
      <div className={styles.webAppBadge}><Braces /> app connected</div>
    </div>
  );
}

export function CryptoSeoSections() {
  return (
    <div className={styles.seoRoot}>
      <section className={styles.pillar} id="free-ai-app-builder" aria-labelledby="free-ai-heading">
        <div className={styles.split}>
          <div className={styles.copy}>
            <span className={styles.kicker}>START FREE · KEEP THE CODE</span>
            <h2 id="free-ai-heading">Free AI App Builder for Web3 & Blockchain Projects</h2>
            <p className={styles.lead}>
              Start with a Web3 idea or an existing repository. Xroga helps turn product requirements into
              inspectable software work while keeping the project attached to code you can review and continue.
            </p>
            <div className={styles.checks}>
              <span><CheckCircle2 /> Start without a card</span>
              <span><CheckCircle2 /> New project or existing repository</span>
              <span><CheckCircle2 /> Reviewable code instead of a locked prototype</span>
            </div>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="#builder">
                Start building free <ArrowRight />
              </Link>
              <Link className={styles.secondaryAction} href="/ai-app-builder">
                Explore the AI app builder
              </Link>
            </div>
          </div>
          <RepoFolderVisual />
        </div>
      </section>

      <section className={styles.pillar} id="web3-app-development" aria-labelledby="web3-dev-heading">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.kicker}>WEB3 APP DEVELOPMENT</span>
            <h2 id="web3-dev-heading">Build a Web3 App Without Starting From Zero</h2>
          </div>
          <p>
            Web3 app development is more than generating a screen. Xroga keeps the product workflow connected
            across the repository, interface, APIs, data and the checks required by the project.
          </p>
        </div>

        <div className={styles.devGrid}>
          <DevTreeVisual />
          <div className={styles.devCards}>
            {DEV_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className={styles.devCard}>
                  <span><Icon /></span>
                  <div><h3>{step.title}</h3><p>{step.copy}</p></div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.pillar} id="specialized-builders" aria-labelledby="specialized-heading">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.kicker}>ONE BUILDER · MULTIPLE PRODUCT SHAPES</span>
            <h2 id="specialized-heading">Build the Product, Not Just the Landing Page</h2>
          </div>
          <p>
            Use the same repository-aware workflow for dashboards, crypto SaaS and Web3 websites instead of
            stitching together disconnected prototypes.
          </p>
        </div>

        <div className={styles.productGrid}>
          {PRODUCT_CARDS.map((item, index) => {
            const Icon = item.icon;
            return (
              <article className={styles.productCard} key={item.eyebrow}>
                <div className={styles.productVisual}><ProductVisual index={index} /></div>
                <div className={styles.productBody}>
                  <span className={styles.productEyebrow}><Icon /> {item.eyebrow}</span>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                  <ul>{item.items.map((entry) => <li key={entry}>{entry}</li>)}</ul>
                  <Link href={item.href}>{item.cta} <ArrowRight /></Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.pillar} id="how-to-build-web3-app" aria-labelledby="how-to-heading">
        <div className={styles.verifyGrid}>
          <div className={styles.copy}>
            <span className={styles.kicker}>HOW TO BUILD A WEB3 APP WITH AI</span>
            <h2 id="how-to-heading">Describe → Build → Verify → Ship</h2>
            <p className={styles.lead}>
              Give Xroga the outcome, repository context and acceptance criteria. The work stays visible from
              implementation through applicable checks and supported deployment.
            </p>

            <ol className={styles.numbered}>
              <li><b>1.</b><span><strong>Describe the outcome.</strong> Users, flows, data, blockchain requirements and what done means.</span></li>
              <li><b>2.</b><span><strong>Build in the project.</strong> Work across the required files instead of returning only a mockup.</span></li>
              <li><b>3.</b><span><strong>Verify the result.</strong> Run project-appropriate checks and surface the evidence or blocker.</span></li>
              <li><b>4.</b><span><strong>Ship through accounts you control.</strong> Keep the repository and provider ownership with you.</span></li>
            </ol>
          </div>
          <TerminalVisual />
        </div>
      </section>

      <section className={[styles.pillar, styles.positioning].join(' ')} aria-labelledby="positioning-heading">
        <div className={styles.positioningMark}><Sparkles /></div>
        <div>
          <span className={styles.kicker}>FROM CRYPTO IDEA TO VERIFIED CODE</span>
          <h2 id="positioning-heading">A Blockchain App Builder Built for Real Product Work</h2>
          <p>
            Xroga is for Web3 apps, dApps, dashboards, crypto SaaS, wallet-facing tools and on-chain products
            that need to remain attached to inspectable code. It is not a custody provider, exchange or managed
            trading service.
          </p>
        </div>
        <Link className={styles.primaryAction} href="/docs">
          See how Xroga works <ArrowRight />
        </Link>
      </section>
    </div>
  );
}
