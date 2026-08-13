import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Bot, Clapperboard, Code2, Globe2, Lightbulb, Rocket, ShoppingBag, Sparkles } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { MarketingFooter } from '@/components/layout/MarketingFooter';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { COMPANY_CONTACT } from '@/lib/companyContact';
import { buildMetadata } from '@/lib/seo';
import '@/styles/homepage-coding.css';
import '@/styles/about.css';

export const metadata: Metadata = buildMetadata({
  title: 'About Xroga AI & Founder Muhammad Ibrahim',
  description:
    'Meet Muhammad Ibrahim, the solo founder building Xroga AI to help people turn ambitious ideas into real, owned software.',
  path: '/about',
  keywords: ['about Xroga AI', 'Muhammad Ibrahim founder', 'AI coding agent founder', 'Xroga story'],
});

const JOURNEY = [
  { icon: Globe2, label: '5+ years online', title: 'Learning by doing', body: 'E-commerce, dropshipping, YouTube Shorts, long-form video, outreach, client acquisition, and the everyday work of building on the internet.' },
  { icon: Code2, label: 'Agency chapter', title: 'Xroga before the product', body: 'Xroga began as a web agency: finding clients, booking projects, and manually delivering websites, AI voice agents, chatbots, and related digital services.' },
  { icon: Bot, label: '2 years in AI', title: 'The automation pivot', body: 'Modern paid AI tools made a bigger idea possible: stop repeating service work and build a system that can turn a person’s idea into working software.' },
  { icon: Rocket, label: 'Now', title: 'Xroga AI', body: 'An independent AI coding product being built to help people describe an outcome, create the product, verify it, and keep ownership of the result.' },
] as const;

const PATH = [
  { icon: ShoppingBag, text: 'Dropshipping' },
  { icon: Clapperboard, text: 'Content & YouTube' },
  { icon: Globe2, text: 'Web agency' },
  { icon: Bot, text: 'AI agents' },
  { icon: Sparkles, text: 'Xroga AI' },
] as const;

export default function AboutPage() {
  return (
    <div className="ab-root">
      <PageJsonLd
        path="/about"
        name="About Xroga AI and Muhammad Ibrahim"
        description="The founder story, journey, mission, and future ambition behind Xroga AI."
        type="AboutPage"
      />

      <header className="ab-nav">
        <div className="ab-shell ab-nav-inner">
          <Logo href="/" variant="homepage" height={36} />
          <nav className="ab-nav-links" aria-label="About page navigation">
            <Link href="/">Home</Link>
            <Link href="/about" aria-current="page">About</Link>
            <Link href="#story">Story</Link>
            <Link href="#mission">Mission</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <Link href="/auth/signup" className="ab-nav-cta">Start a project</Link>
        </div>
      </header>

      <main>
        <section className="ab-hero" aria-labelledby="about-title">
          <div className="ab-shell">
            <div className="ab-hero-card">
              <div className="ab-hero-copy">
                <p className="ab-kicker">XROGA AI · FOUNDER STORY</p>
                <h1 id="about-title">Ideas deserve<br /><em>a way into reality.</em></h1>
                <p className="ab-hero-lede">
                  Xroga AI is being built for people who can see the product clearly—even when they do not yet know how to code it.
                </p>
                <div className="ab-actions">
                  <Link href="/auth/signup" className="ab-button ab-button--dark">Build your idea <ArrowRight aria-hidden="true" /></Link>
                  <Link href="#story" className="ab-button ab-button--light">Read the story</Link>
                </div>
                <dl className="ab-stats">
                  <div><dt>2 years</dt><dd>Building with AI</dd></div>
                  <div><dt>5+ years</dt><dd>Working online</dd></div>
                  <div><dt>1 founder</dt><dd>One ambitious mission</dd></div>
                </dl>
              </div>

              <div className="ab-portrait-wrap">
                <Image
                  src="/about/muhammad-ibrahim-striped-editorial.png"
                  alt="Muhammad Ibrahim, founder and CEO of Xroga AI"
                  fill
                  priority
                  sizes="(max-width: 820px) 100vw, 48vw"
                  className="ab-portrait"
                />
                <div className="ab-founder-card">
                  <span>Founder & CEO</span>
                  <strong>Muhammad Ibrahim</strong>
                  <p>Building the product he once wished existed.</p>
                  <Link href="/contact" aria-label="Contact Muhammad Ibrahim"><ArrowRight aria-hidden="true" /></Link>
                </div>
              </div>
            </div>

            <div className="ab-path" aria-label="The path to Xroga AI">
              {PATH.map(({ icon: Icon, text }, index) => (
                <div key={text} className={index === PATH.length - 1 ? 'is-current' : undefined}>
                  <Icon aria-hidden="true" /><span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ab-story" id="story" aria-labelledby="story-heading">
          <div className="ab-shell">
            <div className="ab-section-heading">
              <p className="ab-kicker">THE ROAD HERE</p>
              <h2 id="story-heading">Not an overnight story.<br /><em>A useful one.</em></h2>
              <p>Every earlier chapter taught Ibrahim something Xroga needs today: how people buy, how clients explain problems, how products are delivered, and where automation can remove the hardest barriers.</p>
            </div>
            <div className="ab-journey-grid">
              {JOURNEY.map(({ icon: Icon, label, title, body }, index) => (
                <article key={title} className="ab-journey-card">
                  <div className="ab-journey-top"><span>0{index + 1}</span><Icon aria-hidden="true" /></div>
                  <small>{label}</small>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ab-founder-note" aria-labelledby="founder-note-heading">
          <div className="ab-shell ab-founder-note-grid">
            <div className="ab-note-mark" aria-hidden="true"><Lightbulb /></div>
            <div>
              <p className="ab-kicker">FOUNDER’S NOTE</p>
              <h2 id="founder-note-heading">“I am not a high-end coder. I am an idea-led founder who learned how to direct modern AI into building real products.”</h2>
            </div>
            <div className="ab-note-copy">
              <p>Today, Xroga is built by Ibrahim as a solo founder—with faith in Allah, persistence, basic coding knowledge, strong product ideas, and paid modern AI coding tools doing much of the implementation and engineering work under his direction.</p>
              <p>The tools are collaborators, not the founder. Ibrahim remains responsible for the vision, decisions, product standard, and outcome. A larger team becomes the next chapter when Xroga is funded and ready to scale responsibly.</p>
            </div>
          </div>
        </section>

        <section className="ab-mission" id="mission" aria-labelledby="mission-heading">
          <div className="ab-shell">
            <div className="ab-mission-card">
              <div>
                <p className="ab-kicker ab-mission-kicker"><Sparkles aria-hidden="true" /> THE MISSION</p>
                <h2 id="mission-heading">Your idea should not stop at <em>“I can’t code.”</em></h2>
              </div>
              <div className="ab-mission-copy">
                <p>Millions of people understand the problem they want to solve, but do not have the technical knowledge, money, or team to turn it into software. Xroga’s goal is simple: help them turn that dream project into reality.</p>
                <p>With future funding, Xroga will hire a focused team, deepen the product, and pursue capabilities that even today’s largest AI builders have not imagined. The ambition is deliberately big; the work starts one verified product at a time.</p>
                <div className="ab-actions">
                  <Link href="/auth/signup" className="ab-button ab-button--blue">Bring your idea <ArrowRight aria-hidden="true" /></Link>
                  <a href={`mailto:${COMPANY_CONTACT.email}`} className="ab-button ab-button--outline">Talk to Ibrahim</a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
