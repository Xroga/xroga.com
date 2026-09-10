import Link from 'next/link';
import { ArrowRight, BookOpen, FileSearch, Globe2, Image as ImageIcon, LockKeyhole, MessagesSquare, SearchCheck } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { MarketingFooter } from '@/components/layout/MarketingFooter';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import '@/styles/ai-chat-landing.css';

const capabilities = [
  { icon: Globe2, label: 'Current web', title: 'Search when freshness matters.', body: 'Xroga can route current-information questions to Parallel, retain useful source URLs, and keep retrieved text separate from trusted instructions.', status: 'Working' },
  { icon: SearchCheck, label: 'Research', title: 'Compare evidence, then answer.', body: 'Research requests can inspect several public sources and synthesize the useful parts. Deeper autonomous, multi-hop research remains a developing capability.', status: 'Working · deeper mode partial' },
  { icon: FileSearch, label: 'Documents', title: 'Read the material you provide.', body: 'Upload supported PDF, DOCX, text, Markdown, code, or image files for extraction and analysis. Large inputs are bounded before model use.', status: 'Working' },
  { icon: ImageIcon, label: 'Vision', title: 'Understand screenshots and images.', body: 'Ask what is visible, compare a reference with a product screen, or identify a UI problem. A connected project is required before Xroga can implement a code fix.', status: 'Working · code handoff contextual' },
];

const examples = [
  'Search the latest official documentation for this deployment error.',
  'Research current authentication options for this stack and compare the trade-offs.',
  'Read this specification and identify missing implementation requirements.',
  'Analyze this mobile screenshot and explain what is broken.',
  'Find the current official API for this service and map it to my project.',
  'Search recent public X discussion about this developer tool.',
];

export function AiChatLanding() {
  return (
    <main className="xac-page">
      <PageJsonLd path="/features/ai-chat" name="Xroga AI Chat — Search, Research, Analyze & Act" description="Use Xroga AI Chat for grounded conversation, current research, document analysis, screenshot understanding, and safe repository collaboration." />
      <header className="xac-header">
        <Logo href="/" variant="homepage" height={32} />
        <nav aria-label="Main navigation">
          <Link href="/features">Features</Link>
          <Link href="/ai-coding-agent">Coding Agent</Link>
          <Link href="/pricing">Pricing</Link>
          <Link className="xac-button xac-button--small" href="/auth/signup">Start free</Link>
        </nav>
      </header>

      <section className="xac-hero">
        <div className="xac-hero__copy">
          <p className="xac-kicker">One conversation · supported tools when needed</p>
          <h1>Xroga AI Chat</h1>
          <p className="xac-lead">Research, analyze and act from one conversation.</p>
          <p className="xac-subcopy">Ask naturally. Xroga decides whether the answer needs live public evidence, an uploaded document, visual analysis, or a handoff to the repository-aware coding workflow—and reports when a tool is unavailable.</p>
          <div className="xac-actions"><Link className="xac-button" href="/auth/signup">Open Xroga Chat <ArrowRight aria-hidden="true" /></Link><Link className="xac-text-link" href="#capabilities">See current capabilities</Link></div>
        </div>
        <div className="xac-conversation" aria-label="Example Xroga Chat workflow">
          <div className="xac-conversation__top"><span /><span /><span /><strong>Research thread</strong></div>
          <div className="xac-message xac-message--user">Search the latest official Next.js documentation for this issue.</div>
          <div className="xac-tool-state"><Globe2 aria-hidden="true" /><span><b>Current web</b><small>Retrieving public sources</small></span><i>Running</i></div>
          <div className="xac-message xac-message--assistant"><b>Evidence first.</b><p>Xroga keeps source titles and URLs attached to the answer, and treats retrieved pages as untrusted content rather than hidden instructions.</p><div className="xac-source-row"><span>1</span> Official documentation <small>Source retained</small></div></div>
        </div>
      </section>

      <section className="xac-flow" aria-labelledby="flow-heading">
        <p className="xac-kicker">Automatic routing</p>
        <h2 id="flow-heading">You describe the outcome. Xroga selects the smallest capable path.</h2>
        <div className="xac-flow__steps"><span>Understand intent</span><i>→</i><span>Select supported tool</span><i>→</i><span>Run and inspect</span><i>→</i><span>Answer with evidence</span></div>
      </section>

      <section className="xac-capabilities" id="capabilities" aria-labelledby="capability-heading">
        <div className="xac-section-head"><div><p className="xac-kicker">Current product capability</p><h2 id="capability-heading">Useful tools, with honest boundaries.</h2></div><p>Capability depends on configured providers, your plan, and any account or project authorization required for the request.</p></div>
        <div className="xac-grid">{capabilities.map(({ icon: Icon, label, title: itemTitle, body, status }) => <article key={label}><Icon aria-hidden="true" /><p className="xac-card-label">{label}</p><h3>{itemTitle}</h3><p>{body}</p><span>{status}</span></article>)}</div>
      </section>

      <section className="xac-split" aria-label="X search and project collaboration">
        <article><p className="xac-kicker">X / Twitter evidence</p><h2>X research stays X-only.</h2><p>When the question specifically depends on public X posts, Xroga uses xAI&apos;s X Search. Non-X citations are rejected, and an uncited synthesis is not accepted as evidence.</p></article>
        <article><p className="xac-kicker">Project collaboration</p><h2>From analysis to a focused code task.</h2><p>When a request requires implementation, Xroga transfers it to the repository-aware coding workflow. Project permissions, diffs, checks, and provider-backed publishing remain separate from ordinary Chat.</p><Link href="/ai-coding-agent">Explore the AI Coding Agent <ArrowRight aria-hidden="true" /></Link></article>
      </section>

      <section className="xac-examples" aria-labelledby="examples-heading"><div><p className="xac-kicker">Real requests</p><h2 id="examples-heading">Ask in plain language.</h2><p>These examples map to current conversation, research, document, vision, and repository-handoff paths.</p></div><ul>{examples.map((example) => <li key={example}>{example}</li>)}</ul></section>

      <section className="xac-compare" aria-labelledby="compare-heading"><p className="xac-kicker">Choose the right surface</p><h2 id="compare-heading">AI Chat and AI Coding Agent solve different jobs.</h2><div><article><MessagesSquare aria-hidden="true" /><h3>Xroga AI Chat</h3><p>Questions, current public research, documents, screenshots, API discovery, and cross-tool analysis.</p></article><article><BookOpen aria-hidden="true" /><h3>Xroga AI Coding Agent</h3><p>Repository understanding, implementation, GitHub changes, checks, repair, and deployment workflows.</p></article></div></section>

      <section className="xac-boundaries" aria-labelledby="security-heading"><LockKeyhole aria-hidden="true" /><div><p className="xac-kicker">Security and truth</p><h2 id="security-heading">Tools stay server-side. Failures stay visible.</h2><p>Provider keys are not sent to the browser. Xroga does not claim it searched, changed a repository, tested a site, generated an asset, or deployed a product without corresponding runtime evidence. General-purpose Chat browser automation and image generation are not currently marketed as working capabilities.</p></div><Link href="/security">Read the security boundaries</Link></section>

      <section className="xac-cta"><p className="xac-kicker">Start with the question</p><h2>One conversation. The right supported path.</h2><Link className="xac-button" href="/auth/signup">Get started — it&apos;s free <ArrowRight aria-hidden="true" /></Link></section>
      <MarketingFooter />
    </main>
  );
}
