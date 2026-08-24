import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CircleUser,
  Code2,
  Database,
  FileCode2,
  FileText,
  GitBranch,
  GitPullRequest,
  Layers,
  LifeBuoy,
  Puzzle,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { ThemeBackdrop } from '@/components/layout/ThemeBackdrop';
import { ScrollReveal } from './ScrollReveal';
import { AiCodingAgentHeader } from './AiCodingAgentHeader';
import { CAPABILITY_PAGES } from '@/lib/capabilityPages';
import '@/styles/ai-coding-agent-landing.css';

/**
 * /ai-coding-agent — the repository-work landing page.
 *
 * Every line of copy on this page comes from `CAPABILITY_PAGES['ai-coding-agent']`: the
 * eyebrow, the headline, the intro, the four outcomes, the three process steps and the
 * limits paragraph. Nothing is written here to fill a slot in the layout, so the page
 * cannot drift away from what the rest of the site says this capability does.
 *
 * `CapabilityPage` is deliberately untouched. Five other routes render it, and a layout
 * built for this one page has no business changing theirs.
 *
 * Two things in the reference are not reproduced, and the omission is the point:
 *
 * 1. **The avatar rows.** The reference puts four photographed faces under the hero
 *    beside "Trusted by builders and teams shipping production code", and four more above
 *    the final button. There is no verified customer list in this repository, so those
 *    faces would be strangers standing in for users who have not been counted. Stock
 *    portraits presented as customers are fabricated proof.
 * 2. **"No credit card required."** Nothing in the repository establishes it. There is one
 *    paid plan and a fifty-action trial; whether that trial takes a card is not something
 *    this page can find out, so it does not assert it.
 *
 * The workspace and repository panels are HTML, not screenshots, and both are labelled as
 * interface demonstrations. The run they depict is illustrative — no ticket number, build
 * status or check result on this page is a record of anything that happened.
 */

const data = CAPABILITY_PAGES['ai-coding-agent'];

/** Icons for the four outcomes, in the order the data lists them. */
const OUTCOME_ICONS = [Code2, Layers, Search, GitPullRequest] as const;

/** Short titles for the outcome cards; the data's full sentence becomes the body. */
const OUTCOME_TITLES = [
  'Update an existing application',
  'Build connected frontend and backend features',
  'Diagnose CI, build, authentication, and deployment failures',
  'Prepare branches, commits, and pull requests',
] as const;

const OUTCOME_BODIES = [
  'Make precise changes without replacing unrelated code.',
  'Deliver end-to-end features that fit your architecture.',
  'Find root causes, apply fixes, and re-run checks.',
  'Work through authorized GitHub access with clear history.',
] as const;

const PROCESS_ICONS = [Search, Code2, ShieldCheck] as const;

/** Where a reader goes next. Every href is a route that exists in `src/app`. */
const NEXT_STEPS = [
  { href: '/docs', icon: FileText, title: 'Documentation', body: 'Learn how Xroga works' },
  { href: '/pricing', icon: BarChart3, title: 'Plan and capacity', body: 'See plans and limits' },
  { href: '/crypto', icon: Puzzle, title: 'Crypto Builder', body: 'Build on-chain with Xroga' },
  { href: '/community', icon: LifeBuoy, title: 'Community', body: 'Learn, share, and grow together' },
] as const;

const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/showcase', label: 'Showcase' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/docs', label: 'Docs' },
      { href: '/research', label: 'Research' },
      { href: '/community', label: 'Community' },
      { href: '/software', label: 'Software' },
    ],
  },
  {
    title: 'Build with Xroga',
    links: [
      { href: '/ai-app-builder', label: 'AI App Builder' },
      { href: '/ai-website-builder', label: 'Website Builder' },
      { href: '/build-saas-with-ai', label: 'SaaS with AI' },
      { href: '/crypto', label: 'Crypto Builder' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
] as const;

/** The check names the verification panel lists. Labels for a demonstration, not results. */
const CHECK_LABELS = ['Lint', 'Type Check', 'Unit Tests', 'Build', 'Security'] as const;

export function AiCodingAgentLanding() {
  return (
    <div className="agx-page xv-theme-surface">
      <PageJsonLd path="/ai-coding-agent" name={data.title} description={data.description} />

      <ThemeBackdrop />

      <AiCodingAgentHeader />

      {/* ------------------------------------------------------------------ hero */}
      <section className="agx-hero">
        <div className="agx-shell agx-hero__grid">
          <div className="agx-hero__copy">
            <p className="agx-pill"><span className="agx-dot" aria-hidden="true" />{data.eyebrow}</p>

            <h1 className="agx-h1">
              AI Coding Agent<br />
              <span className="agx-accent">That Works in<br />Your Repository</span>
            </h1>

            <p className="agx-lede">{data.intro}</p>

            <div className="agx-hero__actions">
              <Link href="/auth/signup" className="agx-btn agx-btn--lg">
                Start with a prompt <Sparkles aria-hidden="true" />
              </Link>
              <Link href="/docs" className="agx-btn agx-btn--lg agx-btn--ghost">
                Read the guide <BookOpen aria-hidden="true" />
              </Link>
            </div>

            {/*
              The reference shows four faces and a trust claim here. There is no verified
              customer list to draw them from, so this states what the product does under
              the conditions the page later spells out, which is checkable.
            */}
            <p className="agx-hero__note">
              <ShieldCheck aria-hidden="true" />
              Runs against your repository with the access you grant, and reports what the
              checks actually returned.
            </p>
          </div>

          <div className="agx-hero__stage">
            <span className="agx-chip agx-chip--a" aria-hidden="true"><Code2 /></span>
            <span className="agx-chip agx-chip--b" aria-hidden="true"><Database /></span>
            <span className="agx-chip agx-chip--c" aria-hidden="true"><Puzzle /></span>
            <span className="agx-chip agx-chip--d" aria-hidden="true"><Shield /></span>
            <span className="agx-chip agx-chip--e" aria-hidden="true"><BarChart3 /></span>

            <WorkspaceDemo />

            <span className="agx-plinth" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- outcomes */}
      <section className="agx-band" aria-labelledby="agx-outcomes-heading">
        <div className="agx-shell">
          <ScrollReveal>
            <div className="agx-band__inner">
              <h2 className="agx-h2" id="agx-outcomes-heading">
                Outcomes <span className="agx-accent">Xroga</span><br />can help produce
              </h2>

              <div className="agx-cards">
                {data.outcomes.map((outcome, i) => {
                  const Icon = OUTCOME_ICONS[i] ?? Code2;
                  return (
                    <article className="agx-card" key={outcome}>
                      <span className="agx-card__icon" aria-hidden="true"><Icon /></span>
                      <h3>{OUTCOME_TITLES[i] ?? outcome}</h3>
                      <p>{OUTCOME_BODIES[i] ?? outcome}</p>
                      <ArrowRight className="agx-card__arrow" aria-hidden="true" />
                    </article>
                  );
                })}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --------------------------------------------------------------- process */}
      <section className="agx-band" aria-labelledby="agx-process-heading">
        <div className="agx-shell">
          <ScrollReveal>
            <div className="agx-band__inner">
              <h2 className="agx-h2" id="agx-process-heading">
                How the work<br />stays <span className="agx-accent">controlled</span>
              </h2>

              <ol className="agx-steps">
                {data.process.map((step, i) => {
                  const Icon = PROCESS_ICONS[i] ?? Search;
                  return (
                    <li className="agx-step" key={step.title}>
                      <span className="agx-step__num">{String(i + 1).padStart(2, '0')}</span>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                      <span className="agx-step__plinth" aria-hidden="true">
                        <Icon />
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- limits */}
      <section className="agx-band" aria-labelledby="agx-limits-heading">
        <div className="agx-shell">
          <ScrollReveal>
            <div className="agx-band__inner">
              <div className="agx-limits">
                <div>
                  <h2 className="agx-h2" id="agx-limits-heading">
                    What Xroga<br />does <span className="agx-accent">not fabricate</span>
                  </h2>
                  <p className="agx-limits__body">{data.limits}</p>
                </div>

                <div className="agx-cards agx-cards--sm">
                  {NEXT_STEPS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link className="agx-card agx-card--link" key={item.href} href={item.href}>
                        <span className="agx-card__icon" aria-hidden="true"><Icon /></span>
                        <h3>{item.title}</h3>
                        <p>{item.body}</p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------- cta */}
      <section className="agx-band" aria-labelledby="agx-cta-heading">
        <div className="agx-shell">
          <ScrollReveal>
            <div className="agx-cta">
              <div className="agx-cta__side" aria-hidden="true">
                <RepoTree />
              </div>

              <div className="agx-cta__mid">
                <h2 className="agx-h2 agx-h2--center" id="agx-cta-heading">
                  Bring the outcome.<br />
                  <span className="agx-accent">Xroga does the repository work.</span>
                </h2>
                <p className="agx-cta__lede">
                  Describe what you want built, and continue in the real workspace —
                  inspecting your project, implementing focused changes, and reporting the
                  evidence a real check produced.
                </p>
                <Link href="/auth/signup" className="agx-btn agx-btn--lg">
                  Start building with Xroga <ArrowRight aria-hidden="true" />
                </Link>
                <p className="agx-cta__foot">
                  One plan, with a free trial to start. Usage and limits are shown in the
                  workspace.
                </p>
              </div>

              <div className="agx-cta__side">
                <ChecksDemo />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- footer */}
      <footer className="agx-footer">
        <div className="agx-shell agx-footer__grid">
          <div className="agx-footer__brand">
            <Logo href="/" variant="homepage" height={34} />
            <p>AI coding agent that works where your code lives.</p>
            <div className="agx-social">
              <a href="https://github.com/Xroga" aria-label="Xroga on GitHub" rel="me noreferrer" target="_blank">
                <GitHubIcon aria-hidden="true" />
              </a>
              <Link href="/community" aria-label="Community"><LifeBuoy aria-hidden="true" /></Link>
              <Link href="/contact" aria-label="Contact"><CircleUser aria-hidden="true" /></Link>
            </div>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav className="agx-footer__col" key={group.title} aria-label={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="agx-footer__card">
            <p>Build with control.<br />Ship with confidence.</p>
            <Logo href={null} variant="homepage" height={26} className="agx-footer__card-mark" />
          </div>
        </div>

        <div className="agx-shell agx-footer__base">
          <p>© {new Date().getFullYear()} Xroga. All rights reserved.</p>
          <p className="agx-footer__legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * The workspace window from the reference, drawn in HTML rather than baked into an image.
 *
 * It is an interface demonstration. The repository name, ticket number and terminal lines
 * illustrate the shape of a run; none of them is a record of one, which is why the panel
 * says so in text rather than relying on the reader to infer it.
 */
function WorkspaceDemo() {
  const files = ['Overview', 'Files', 'Commits', 'Branches', 'Pull Requests', 'Checks', 'Settings'];
  const icons = [Layers, FileCode2, GitBranch, GitBranch, GitPullRequest, ShieldCheck, Settings];

  return (
    <figure className="agx-window">
      <div className="agx-window__bar">
        <span className="agx-window__title"><Logo href={null} variant="homepage" height={16} />Workspace</span>
        <span className="agx-window__dots" aria-hidden="true"><i /><i /><i /></span>
      </div>

      <div className="agx-window__body">
        <aside className="agx-window__rail">
          <p className="agx-window__label">Active repository</p>
          <p className="agx-window__repo"><GitBranch aria-hidden="true" />acme/web-app</p>
          <p className="agx-window__branch">main <ChevronDown aria-hidden="true" /></p>
          <ul>
            {files.map((f, i) => {
              const Icon = icons[i];
              return (
                <li key={f} data-active={i === 0}>
                  <Icon aria-hidden="true" />{f}
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="agx-window__main">
          <p className="agx-window__head">
            <span className="agx-window__ticket">#125</span>
            Add user dashboard analytics
            <span className="agx-badge">Completed</span>
          </p>

          <div className="agx-turn">
            <span className="agx-turn__who" aria-hidden="true"><CircleUser /></span>
            <div>
              <strong>You</strong>
              <p>Add analytics cards to the dashboard and connect them to the reports API.</p>
            </div>
          </div>

          <div className="agx-turn">
            <span className="agx-turn__who agx-turn__who--agent" aria-hidden="true"><Sparkles /></span>
            <div>
              <strong>Xroga</strong>
              <p>
                Understood. I&rsquo;ll inspect the project, implement the feature, run checks,
                and open a pull request with evidence.
              </p>
            </div>
          </div>

          <div className="agx-term">
            <p className="agx-term__prompt">xroga@build</p>
            <p>&gt; Scanning repository&hellip;</p>
            <p>&gt; Applying changes&hellip;</p>
            <p>&gt; Running checks&hellip;</p>
            <p>&gt; All checks passed.</p>
            <p>&gt; Creating pull request&hellip;</p>
            <span className="agx-stamp" aria-hidden="true">Build<br />verified</span>
          </div>
        </div>
      </div>

      <figcaption className="agx-window__caption">
        An interface demonstration. The repository, ticket and output shown are illustrative,
        not a record of a completed run.
      </figcaption>
    </figure>
  );
}

/** The file tree beside the closing call to action. Decorative, so it carries no links. */
function RepoTree() {
  const rows = [
    { depth: 0, icon: GitBranch, label: 'acme/web-app' },
    { depth: 0, icon: GitBranch, label: 'main' },
    { depth: 1, icon: FileCode2, label: 'src' },
    { depth: 2, icon: FileCode2, label: 'components' },
    { depth: 3, icon: FileCode2, label: 'dashboard' },
    { depth: 4, icon: FileCode2, label: 'AnalyticsCard.tsx', accent: true },
    { depth: 2, icon: FileCode2, label: 'api' },
    { depth: 3, icon: FileCode2, label: 'reports.ts' },
    { depth: 2, icon: FileCode2, label: 'tests' },
    { depth: 3, icon: FileCode2, label: 'dashboard.test.ts' },
  ];

  return (
    <div className="agx-tree">
      {rows.map((row, i) => {
        const Icon = row.icon;
        return (
          <p key={`${row.label}-${i}`} style={{ paddingLeft: `${row.depth * 0.85}rem` }} data-accent={row.accent}>
            <Icon aria-hidden="true" />{row.label}
          </p>
        );
      })}
    </div>
  );
}

/** The code and checks panel. Also a demonstration — the ticks are labels, not results. */
function ChecksDemo() {
  return (
    <div className="agx-proof">
      <pre className="agx-code" aria-hidden="true">
        <code>{`function getReports() {
  return fetch('/api/reports')
    .then(r => r.json())
}`}</code>
      </pre>

      <div className="agx-checks">
        <p className="agx-checks__title"><Wrench aria-hidden="true" />Checks</p>
        <ul>
          {CHECK_LABELS.map((label) => (
            <li key={label}><Check aria-hidden="true" />{label}</li>
          ))}
        </ul>
        <p className="agx-checks__note">
          The checks a project defines. Which of these run depends on your repository.
        </p>
      </div>
    </div>
  );
}
