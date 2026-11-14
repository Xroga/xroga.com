import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, Blocks, BookOpen, BrainCircuit, Check,
  CheckCircle2, ChevronRight, CircleDot, CloudUpload, Code2,
  FileCode2, GitBranch, Globe2, Layers3, LockKeyhole,
  ShieldCheck, Sparkles, Workflow,
} from 'lucide-react';
import { CAPABILITY_PAGES } from '@/lib/capabilityPages';
import { buildMetadata } from '@/lib/seo';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { FeaturesCatalog } from './FeaturesCatalog';
import { PUBLIC_FEATURE_GROUPS, PUBLIC_FEATURE_TOTAL } from '@/lib/publicFeatureDirectory';
import './features.css';

export const metadata: Metadata = buildMetadata({
  title: 'Xroga Features — AI Chat, App Building & Coding Agent',
  description: 'Explore Xroga AI Chat, repository-aware coding, app and website building, GitHub delivery, validation, and authorized deployment.',
  path: '/features',
  keywords: ['Xroga features', 'Xroga AI Chat', 'AI coding agent features', 'AI app builder'],
});

const capabilities = CAPABILITY_PAGES;

function WorkflowPreview() {
  return (
    <div className="xf-workspace" aria-label="Illustration of a software work plan, not a live task">
      <div className="xf-workspace-top">
        <div className="xf-window-dots"><i /><i /><i /></div>
        <span>Example workspace</span>
        <span className="xf-workspace-private"><LockKeyhole size={12} /> Your project</span>
      </div>
      <div className="xf-workspace-body">
        <div className="xf-workspace-prompt">
          <span className="xf-mini-avatar"><Sparkles size={14} /></span>
          <div><small>YOUR REQUEST</small><strong>Build an appointment dashboard for my team.</strong></div>
        </div>
        <div className="xf-workspace-divider"><span>Proposed workflow</span></div>
        <div className="xf-work-steps">
          <div><span className="xf-step-marker">01</span><span>Understand the project</span><Check size={15} /></div>
          <div><span className="xf-step-marker">02</span><span>Implement in your repository</span><Code2 size={15} /></div>
          <div><span className="xf-step-marker">03</span><span>Run applicable checks</span><ShieldCheck size={15} /></div>
          <div><span className="xf-step-marker">04</span><span>Prepare changes for review</span><GitBranch size={15} /></div>
        </div>
        <div className="xf-workspace-footer"><CircleDot size={12} /><span>Illustrative workflow · no task executed</span><span className="xf-workspace-indicator" /></div>
      </div>
      <div className="xf-workspace-float"><CheckCircle2 size={17}/><div><strong>Work you can inspect</strong><span>Changes, checks and evidence</span></div></div>
    </div>
  );
}

type SceneType = 'builder' | 'coding' | 'chat' | 'website' | 'github' | 'saas' | 'deploy';

function Scene({ type }: { type: SceneType }) {
  if (type === 'builder') return (
    <div className="xf-scene xf-scene-builder" aria-hidden="true">
      <div className="xf-mock-browser">
        <div className="xf-mock-toolbar"><span className="xf-dots"><i/><i/><i/></span><span className="xf-address">your-new-app / dashboard</span><span className="xf-mock-live"/></div>
        <div className="xf-mock-app">
          <div className="xf-mock-rail"><span/><span/><span/><span/></div>
          <div className="xf-mock-main"><div className="xf-mock-head"/><div className="xf-mock-stats"><i/><i/><i/></div><div className="xf-mock-chart"><b/><b/><b/><b/><b/><b/><b/><b/></div></div>
        </div>
      </div>
      <span className="xf-float-chip xf-float-chip-blue"><Layers3 size={13}/> Interface + API + data</span>
    </div>
  );
  if (type === 'coding') return (
    <div className="xf-scene xf-scene-coding" aria-hidden="true">
      <div className="xf-code-shell"><div className="xf-code-tab"><FileCode2 size={13}/> feature.tsx <span>×</span></div><div className="xf-code-lines"><span><b>01</b><i className="xf-code-purple">export</i> function Dashboard() {'{'}</span><span><b>02</b>  <i className="xf-code-blue">const</i> data = useProject();</span><span><b>03</b>  <i className="xf-code-purple">return</i> (</span><span><b>04</b>    <i className="xf-code-green">&lt;Workspace</i> data={'{'}data{'}'} /&gt;</span><span><b>05</b>  );</span><span><b>06</b>{'}'}</span></div></div>
      <div className="xf-code-review"><span><GitBranch size={13}/> feature/dashboard</span><span><CheckCircle2 size={13}/> Reviewable diff</span></div>
    </div>
  );
  if (type === 'chat') return (
    <div className="xf-scene xf-scene-chat" aria-hidden="true">
      <div className="xf-chat-prompt">What changed in the latest framework release?</div>
      <div className="xf-chat-answer"><span><Sparkles size={13}/> Research assistant</span><i/><i/><i className="xf-line-short"/></div>
      <div className="xf-chat-source"><Globe2 size={13}/> Public web sources</div>
    </div>
  );
  if (type === 'website') return (
    <div className="xf-scene xf-scene-website" aria-hidden="true">
      <div className="xf-site-preview"><div className="xf-site-header"><span className="xf-site-logo"/><span/><span/><span/></div><div className="xf-site-copy"><i/><b/><span/></div><div className="xf-site-button"/><div className="xf-site-decoration"/></div>
      <div className="xf-site-phone"><div/><i/><i/><span/></div>
    </div>
  );
  if (type === 'github') return (
    <div className="xf-scene xf-scene-github" aria-hidden="true">
      <div className="xf-git-node"><GitBranch size={17}/> Branch</div><div className="xf-git-connector"/><div className="xf-git-node"><Code2 size={17}/> Changes</div><div className="xf-git-connector"/><div className="xf-git-node xf-git-pr"><Check size={17}/> Review</div>
      <div className="xf-git-caption">Your repository. Your approval.</div>
    </div>
  );
  if (type === 'saas') return (
    <div className="xf-scene xf-scene-saas" aria-hidden="true">
      <div className="xf-saas-panel"><div className="xf-saas-panel-heading"><Blocks size={14}/> Product architecture</div><div className="xf-saas-grid"><span><LockKeyhole size={16}/> Auth</span><span><Layers3 size={16}/> Data</span><span><Workflow size={16}/> APIs</span><span><ShieldCheck size={16}/> Access</span></div></div>
    </div>
  );
  return (
    <div className="xf-scene xf-scene-deploy" aria-hidden="true">
      <div className="xf-deploy-path"><span><Code2 size={18}/><small>Code</small></span><i/><span><CheckCircle2 size={18}/><small>Build</small></span><i/><span><CloudUpload size={18}/><small>Deploy</small></span></div>
      <div className="xf-deploy-note"><ShieldCheck size={14}/> Verify before claiming “live”</div>
    </div>
  );
}

function FeatureCard({ slug, title, kicker, scene, variant }: {
  slug: keyof typeof CAPABILITY_PAGES;
  title: string;
  kicker: string;
  scene: SceneType;
  variant: string;
}) {
  const capability = capabilities[slug];
  return (
    <Link href={'/' + slug} className={'xf-feature-card ' + variant} aria-label={'Explore ' + title}>
      <div className="xf-card-topline"><span>{kicker}</span><span className="xf-card-arrow"><ArrowUpRight size={18}/></span></div>
      <div className="xf-card-copy"><h3>{title}</h3><p>{capability.description}</p></div>
      <Scene type={scene}/>
      <span className="xf-card-link">Explore feature <ArrowRight size={15}/></span>
    </Link>
  );
}

const benefits = [
  { icon: GitBranch, title: 'Your code stays yours', body: 'Work in a repository you control, with reviewable changes.' },
  { icon: BrainCircuit, title: 'Project-aware work', body: 'Use the existing codebase and patterns instead of starting over.' },
  { icon: ShieldCheck, title: 'Checks before claims', body: 'Keep tests, builds and verification separate from assumptions.' },
  { icon: LockKeyhole, title: 'Permission-led actions', body: 'External operations respect account access and approval.' },
  { icon: Workflow, title: 'Connected workflows', body: 'Bring UI, APIs, data and integrations into one project scope.' },
  { icon: CloudUpload, title: 'Publishing with evidence', body: 'Distinguish a code change from a successful live deployment.' },
];

export default function FeaturesPage() {
  return (
    <main className="xf-root" id="top">
      <PageJsonLd path="/features" name="Xroga AI features" description="Explore Xroga AI Chat, AI Coding Agent, product building, validation, GitHub delivery, and Vercel deployment." type="CollectionPage" />
      <div className="xf-grain" aria-hidden="true"/>
      <div className="xf-container">
        <header className="xf-local-header">
          <Link href="/" className="xf-brand" aria-label="Xroga home"><span className="xf-brand-symbol"><Sparkles size={18}/></span>XROGA<span className="xf-brand-sub">/ FEATURES</span></Link>
          <nav aria-label="Features page navigation">
            <a href="#highlights">Highlights</a>
            <a href="#benefits">Why Xroga</a>
            <a href="#all-features">All features</a>
          </nav>
          <Link href="/auth/signup" className="xf-nav-cta">Start building <ArrowUpRight size={15}/></Link>
        </header>

        <section className="xf-hero" aria-labelledby="xf-title">
          <div className="xf-hero-copy">
            <div className="xf-eyebrow"><span className="xf-pulse"/> EXPLORE XROGA <span className="xf-eyebrow-sep">/</span> ONE CONNECTED WORKSPACE</div>
            <h1 id="xf-title">Ideas are easy.<br/><span>Make them real.</span></h1>
            <p>Research an idea, build software, work in an existing codebase, and take changes through real checks. Xroga brings conversation and repository-aware execution together—without confusing a plan with a finished result.</p>
            <div className="xf-hero-actions"><Link href="/auth/signup" className="xf-btn-primary">Start building free <ArrowUpRight size={18}/></Link><a href="#highlights" className="xf-btn-secondary">Explore capabilities <ChevronRight size={17}/></a></div>
            <div className="xf-hero-proof"><span><CheckCircle2 size={15}/> Keep your code</span><span><CheckCircle2 size={15}/> Review changes</span><span><CheckCircle2 size={15}/> Verify outcomes</span></div>
          </div>
          <WorkflowPreview />
        </section>

        <section className="xf-highlights" id="highlights" aria-labelledby="xf-highlights-title">
          <div className="xf-section-head">
            <div><span className="xf-kicker">01 / THE CAPABILITIES</span><h2 id="xf-highlights-title">Everything you need<br/><span>to move work forward.</span></h2></div>
            <p>From the first prompt to the last validation step. Explore what Xroga is built to help you do.</p>
          </div>
          <div className="xf-feature-grid">
            <FeatureCard slug="ai-app-builder" title="Build apps from an idea." kicker="BUILD / 01" scene="builder" variant="xf-feature-app"/>
            <FeatureCard slug="ai-coding-agent" title="Code with context." kicker="DEVELOP / 02" scene="coding" variant="xf-feature-code"/>
            <Link href="/features/ai-chat" className="xf-feature-card xf-feature-chat" aria-label="Explore AI Chat and research">
              <div className="xf-card-topline"><span>CHAT / 03</span><span className="xf-card-arrow"><ArrowUpRight size={18}/></span></div>
              <div className="xf-card-copy"><h3>Ask. Research. Understand.</h3><p>Search public sources, work through supported documents and screenshots, and hand off implementation to your connected project.</p></div>
              <Scene type="chat"/><span className="xf-card-link">Explore AI Chat <ArrowRight size={15}/></span>
            </Link>
            <FeatureCard slug="ai-website-builder" title="Sites worth shipping." kicker="BUILD / 04" scene="website" variant="xf-feature-site"/>
            <FeatureCard slug="github-ai-coding-agent" title="Push with confidence." kicker="DEVELOP / 05" scene="github" variant="xf-feature-github"/>
            <FeatureCard slug="build-saas-with-ai" title="Beyond the landing page." kicker="BUILD / 06" scene="saas" variant="xf-feature-saas"/>
            <FeatureCard slug="vercel-ai-deployment" title="From build to launch." kicker="SHIP / 07" scene="deploy" variant="xf-feature-deploy"/>
          </div>
        </section>

        <section className="xf-benefits-shell" id="benefits" aria-labelledby="xf-benefits-title">
          <div className="xf-benefits-glow" aria-hidden="true"/>
          <span className="xf-kicker xf-centered">02 / THE DIFFERENCE</span>
          <h2 id="xf-benefits-title">And so much more<span className="xf-accent-dot">.</span></h2>
          <p className="xf-benefits-subtitle">Good AI work goes beyond an answer. It is what you can inspect, own, and build on.</p>
          <div className="xf-benefits-grid">
            {benefits.map(({ icon: Icon, title, body }) => (
              <div className="xf-benefit" key={title}>
                <div className="xf-benefit-art"><span className="xf-art-orbit"/><span className="xf-art-rail"/><span className="xf-benefit-icon"><Icon size={32} strokeWidth={1.5}/></span></div>
                <h3>{title}</h3><p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="xf-catalog-shell" id="all-features" aria-labelledby="xf-all-features-title">
          <div className="xf-section-head xf-catalog-head">
            <div><span className="xf-kicker">03 / THE COMPLETE DIRECTORY</span><h2 id="xf-all-features-title">Explore all<br/><span>Xroga features</span></h2></div>
            <p>{PUBLIC_FEATURE_TOTAL} carefully organized entries across research, building, coding, shipping, workspace tools and app integrations. Explore each category or search directly.</p>
          </div>
          <FeaturesCatalog groups={PUBLIC_FEATURE_GROUPS}/>
        </section>

        <section className="xf-bottom-cta" aria-labelledby="xf-cta-heading"><div className="xf-bottom-glow" aria-hidden="true"/><span className="xf-kicker">START WITH AN IDEA</span><h2 id="xf-cta-heading">Your next build starts here.</h2><p>Describe the outcome. Keep control of the code. See what was actually done.</p><Link href="/auth/signup" className="xf-btn-primary">Start building free <ArrowUpRight size={18}/></Link></section>
        <footer className="xf-local-footer"><Link href="/" className="xf-brand"><span className="xf-brand-symbol"><Sparkles size={15}/></span>XROGA</Link><div><Link href="/docs"><BookOpen size={14}/> Docs</Link><Link href="/integrations"><Blocks size={14}/> Integrations</Link><Link href="/pricing"><ArrowRight size={14}/> Pricing</Link></div><a href="#top">Back to top ↑</a></footer>
      </div>
    </main>
  );
}
