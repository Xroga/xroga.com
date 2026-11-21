import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Database,
  GitBranch,
  Layers3,
  PlugZap,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TestTube2,
} from 'lucide-react';

import styles from './AiAppBuilderSeoContent.module.css';

const outcomes = [
  {
    icon: Layers3,
    label: 'Web apps and SaaS',
    title: 'Build real web applications',
    body: 'Start a dashboard, client portal, internal tool, or SaaS product. Xroga helps connect interfaces, backend logic, authentication, and data when the project supports them.',
    href: '/build-saas-with-ai',
    action: 'Explore SaaS building',
  },
  {
    icon: Smartphone,
    label: 'iPhone and Android',
    title: 'Prepare mobile app projects',
    body: 'Work with supported mobile toolchains, including Expo-based projects. Prepare builds and release materials for App Store or Google Play review; developer accounts and store approval stay with you.',
    href: '/showcase',
    action: 'See product examples',
  },
  {
    icon: Code2,
    label: 'GitHub and source control',
    title: 'Own and extend your code',
    body: 'Make reviewable changes in a repository you control. Keep source files inspectable, reuse existing architecture, and return to improve the application later.',
    href: '/ai-coding-agent',
    action: 'Explore the coding agent',
  },
] as const;

const buildSteps = [
  {
    title: 'Describe the app',
    description: 'Start with an idea, a user flow, or an existing repository. Explain what people should be able to do.',
  },
  {
    title: 'Build and connect',
    description: 'Xroga works on the supported UI, APIs, data, and integrations in one project, with access scoped to your permissions.',
  },
  {
    title: 'Test, review, launch',
    description: 'Run applicable checks, inspect results, and prepare a preview or authorized deployment. External publishing still needs the right accounts and approval.',
  },
] as const;

const faqs = [
  {
    question: 'What is an AI app builder?',
    answer: 'An AI app builder helps turn a product description into application code and workflows. Xroga also focuses on inspectable project files, applicable tests, and reviewable deployment preparation rather than only generating a visual mockup.',
  },
  {
    question: 'Can I create an app for free with Xroga?',
    answer: 'Yes. Xroga has a $0 plan with no credit card required to start. Included AI capacity is limited, and separate providers such as hosting services or app stores may charge their own fees.',
  },
  {
    question: 'Can I create apps without coding?',
    answer: 'You can begin in plain language without writing code yourself. A more complex app may still need decisions about security, data, payments, testing, external accounts, and publishing.',
  },
  {
    question: 'Can Xroga create iPhone and Android apps?',
    answer: 'Xroga supports compatible mobile development workflows, including Expo-based projects. Device-specific features, signing, build services, privacy information, and store requirements depend on the project and connected accounts.',
  },
  {
    question: 'Does Xroga automatically test AI-generated apps?',
    answer: 'Xroga can run applicable project checks, including type checks, tests, and builds, and report evidence and failures. Which checks can run depends on the application, its dependencies, and the configured environment.',
  },
  {
    question: 'Can Xroga publish my app on the App Store or Google Play?',
    answer: 'Xroga can help prepare supported iOS or Android builds, store visuals, listing material, and release handoffs. Signing, account access, privacy confirmations, final submission, and store approval are separate steps; no approval is guaranteed.',
  },
  {
    question: 'Can Xroga connect apps, payments, APIs, and custom MCP servers?',
    answer: 'Xroga has an integration catalog and supports authorized API and custom MCP connections where configured. Payment services, databases, and individual app actions require supported providers, credentials, and user permissions. A catalog entry alone is not an active connection.',
  },
  {
    question: 'Do I own the source code of my AI-built app?',
    answer: 'Xroga is designed around inspectable project source and authorized repositories rather than an inaccessible visual-only editor. Third-party libraries and external services remain subject to their own licenses and terms.',
  },
  {
    question: 'Can Xroga host or deploy my app?',
    answer: 'Xroga supports deployment preparation and authorized provider-backed workflows, including compatible Vercel projects. A project is only reported as deployed once the provider operation and applicable verification have succeeded.',
  },
] as const;

export function AiAppBuilderSeoContent() {
  return (
    <div className={styles.root}>
      <section className={styles.productSection} aria-labelledby="xab-seo-products">
        <div className={styles.shell}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" /> Create apps with AI</span>
            <h2 id="xab-seo-products">An AI app maker for real software, not just a first screen.</h2>
            <p>Turn ideas into web apps, SaaS products, dashboards and supported mobile projects. Describe the outcome in ordinary language, then keep the code, project decisions and checks visible as Xroga works.</p>
          </div>
          <div className={styles.productGrid}>
            {outcomes.map((item) => {
              const Icon = item.icon;
              return (
                <article className={styles.productCard} key={item.title}>
                  <div className={styles.iconPlate}><Icon aria-hidden="true" size={25} /></div>
                  <p className={styles.cardLabel}>{item.label}</p>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <Link href={item.href} className={styles.inlineLink}>{item.action} <ArrowRight size={16} aria-hidden="true" /></Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.workflowSection} aria-labelledby="xab-seo-workflow">
        <div className={styles.shell}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}><TestTube2 size={15} aria-hidden="true" /> Beyond generation</span>
            <h2 id="xab-seo-workflow">From idea to app. Built, tested, and ready for your review.</h2>
            <p>Xroga helps move from an AI app generator prompt to connected implementation and evidence from real project checks. Generated code is not treated as proof of a successful deployment.</p>
          </div>
          <div className={styles.workflowGrid}>
            {buildSteps.map((step, index) => (
              <div className={styles.workflowCard} key={step.title}>
                <span className={styles.stepNumber}>0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
          <div className={styles.promptPanel}>
            <div>
              <span className={styles.cardLabel}>Try a real app-building prompt</span>
              <p className={styles.promptText}>“Build a customer portal with secure sign-in, an admin dashboard, invoice history, and persistent data. Test the important flows and prepare a preview. Ask me before connecting payments or publishing.”</p>
            </div>
            <Link href="/auth/signup" className={styles.primaryLink}>Start building free <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className={styles.integrationSection} aria-labelledby="xab-seo-integrations">
        <div className={styles.shell}>
          <div className={styles.splitGrid}>
            <div className={styles.splitCopy}>
              <span className={styles.eyebrow}><PlugZap size={15} aria-hidden="true" /> Build connected applications</span>
              <h2 id="xab-seo-integrations">Your app, connected to the services it needs.</h2>
              <p>Great applications work across data, accounts and external services. Xroga can help implement authorized APIs, databases, authentication, payments and custom MCP connections when supported and configured.</p>
              <p>Explore the integration catalog, connect only the tools you choose, and keep credentials in appropriate protected environments. Catalog availability does not mean every app is already connected or every action is enabled.</p>
              <Link href="/integrations" className={styles.inlineLink}>Explore integrations and MCP connections <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
            <div className={styles.stackPanel} aria-label="Examples of connected application capabilities">
              <div className={styles.stackTitle}><Database aria-hidden="true" size={20} /> Connected app foundations</div>
              {[
                ['Authentication', 'Sign-in and user permissions'],
                ['Payments', 'Supported providers with your approval'],
                ['Databases and APIs', 'Persistent data and external services'],
                ['Custom MCP servers', 'Authorized tools and actions'],
                ['Hosting and deployment', 'Environment configuration and checks'],
              ].map(([title, description]) => (
                <div className={styles.stackRow} key={title}>
                  <CheckCircle2 aria-hidden="true" size={18} />
                  <div><strong>{title}</strong><span>{description}</span></div>
                </div>
              ))}
              <p className={styles.panelFootnote}>Availability varies by provider, account and project.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.releaseSection} aria-labelledby="xab-seo-release">
        <div className={styles.shell}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}><Rocket size={15} aria-hidden="true" /> Build anywhere. Launch with Xroga.</span>
            <h2 id="xab-seo-release">Prepare your app for the App Store, Google Play, or the web.</h2>
            <p>For supported projects, Xroga can help prepare code, builds, previews, store materials and a release handoff. You approve consequential steps. Apple and Google review their own store submissions.</p>
          </div>
          <div className={styles.releaseGrid}>
            <article className={styles.releaseCard}>
              <span className={styles.storeMark}>iOS</span>
              <h3>iPhone apps and the App Store</h3>
              <p>Prepare compatible iOS build artifacts, app screenshots, listing text, and the next steps for App Store Connect.</p>
              <div className={styles.releaseStatus}><ShieldCheck size={17} aria-hidden="true" /> Your Apple Developer account and approval required</div>
            </article>
            <article className={styles.releaseCard}>
              <span className={styles.storeMark}>Android</span>
              <h3>Android apps and Google Play</h3>
              <p>Prepare supported Android builds, store visuals and listing information; review Data safety and the appropriate testing or release track.</p>
              <div className={styles.releaseStatus}><ShieldCheck size={17} aria-hidden="true" /> Your Google Play account and approval required</div>
            </article>
            <article className={styles.releaseCard}>
              <span className={styles.storeMark}>Web</span>
              <h3>Web apps and production hosting</h3>
              <p>Use compatible project builds and authorized provider workflows to prepare and verify deployments with your own code and accounts.</p>
              <Link href="/vercel-ai-deployment" className={styles.inlineLink}>How web deployment works <ArrowRight size={16} aria-hidden="true" /></Link>
            </article>
          </div>
          <p className={styles.releaseNote}>A prepared release is not an approved or published app. Developer accounts, signing, privacy declarations, service fees and store decisions remain separate.</p>
        </div>
      </section>

      <section className={styles.faqSection} aria-labelledby="xab-seo-faq">
        <div className={styles.shell}>
          <div className={styles.faqLayout}>
            <div className={styles.faqIntro}>
              <span className={styles.eyebrow}>Common questions</span>
              <h2 id="xab-seo-faq">AI app builder FAQs</h2>
              <p>What it really takes to create apps with AI, connect your tools, test the result and prepare it for launch.</p>
              <Link href="/pricing" className={styles.inlineLink}>See Free and Pro plan limits <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className={styles.faqList}>
              {faqs.map(({ question, answer }) => (
                <details className={styles.faqItem} key={question}>
                  <summary>{question}<span className={styles.plus} aria-hidden="true">+</span></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
          <div className={styles.relatedPanel}>
            <div>
              <h2>Keep learning. Keep building.</h2>
              <p>Compare AI app builders, explore verified examples, and learn how to move from a prompt to an application you can maintain.</p>
            </div>
            <div className={styles.relatedLinks}>
              <Link href="/blog/best-ai-app-builders">Compare AI app builders <ArrowRight size={15} aria-hidden="true" /></Link>
              <Link href="/showcase">Explore app examples <ArrowRight size={15} aria-hidden="true" /></Link>
              <Link href="/docs">Read documentation <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
