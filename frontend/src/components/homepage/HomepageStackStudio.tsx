import Image from 'next/image';
import Link from 'next/link';
import {
  siBrevo,
  siCloudflare,
  siGo,
  siGithub,
  siJavascript,
  siKotlin,
  siOpenjdk,
  siPhp,
  siPython,
  siRuby,
  siRust,
  siSupabase,
  siSwift,
  siTypescript,
  siVercel,
} from 'simple-icons';
import { ArrowUpRight, Check, GitBranch, ShieldCheck } from 'lucide-react';

type SimpleMark = { path: string; hex: string };

const integrations: ReadonlyArray<{ name: string; mark?: SimpleMark; monogram?: string }> = [
  { name: 'GitHub', mark: siGithub },
  { name: 'Vercel', mark: siVercel },
  { name: 'Supabase', mark: siSupabase },
  { name: 'Whop', monogram: 'W' },
  { name: 'Cloudflare', mark: siCloudflare },
  { name: 'Brevo', mark: siBrevo },
];

const languages: ReadonlyArray<{ name: string; mark: SimpleMark }> = [
  { name: 'JavaScript', mark: siJavascript },
  { name: 'TypeScript', mark: siTypescript },
  { name: 'Python', mark: siPython },
  { name: 'OpenJDK', mark: siOpenjdk },
  { name: 'Go', mark: siGo },
  { name: 'Rust', mark: siRust },
  { name: 'PHP', mark: siPhp },
  { name: 'Ruby', mark: siRuby },
  { name: 'Swift', mark: siSwift },
  { name: 'Kotlin', mark: siKotlin },
];

function Mark({ mark, monogram }: { mark?: SimpleMark; monogram?: string }) {
  if (mark) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ color: `#${mark.hex}` }}>
        <path fill="currentColor" d={mark.path} />
      </svg>
    );
  }

  return <span className="xv-stack-studio__monogram" data-letter={monogram} aria-hidden="true" />;
}

function IntegrationRail() {
  return (
    <div className="xv-stack-studio__rail" aria-label="Integrations including GitHub, Vercel, Supabase, Whop, Cloudflare, and Brevo">
      <div className="xv-stack-studio__track">
        {[false, true].map((duplicate) => (
          <div className="xv-stack-studio__group" aria-hidden={duplicate || undefined} key={String(duplicate)}>
            {integrations.map((integration) => (
              <span className="xv-stack-studio__pill" key={integration.name}>
                <i><Mark mark={integration.mark} monogram={integration.monogram} /></i>
                {integration.name}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LanguageRail() {
  return (
    <div className="xv-stack-studio__rail is-reverse" aria-label="Popular programming languages Xroga can work in">
      <div className="xv-stack-studio__track">
        {[false, true].map((duplicate) => (
          <div className="xv-stack-studio__group" aria-hidden={duplicate || undefined} key={String(duplicate)}>
            {languages.map((language) => (
              <span className="xv-stack-studio__pill is-language" key={language.name}>
                <i><Mark mark={language.mark} /></i>
                {language.name}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomepageStackStudio() {
  return (
    <section className="xv-stack-studio xv-scroll-reveal" aria-labelledby="xroga-stack-studio-heading">
      <header className="xv-stack-studio__heading">
        <p>FROM THE BRIEF TO THE BUILD</p>
        <h2 id="xroga-stack-studio-heading">
          The middle becomes <em>visible.</em>
        </h2>
        <span>Brief, build, and proof—connected.</span>
      </header>

      <div className="xv-stack-studio__grid">
        <article className="xv-stack-studio__card is-build-card">
          <div className="xv-stack-studio__art">
            <Image
              src="/homepage/stack/xroga-brief-to-product-20260902.png"
              alt="A product brief becoming connected plans, checks, code, and a verified working interface"
              width={1536}
              height={1024}
              sizes="(max-width: 760px) 94vw, 58vw"
            />
            <span className="xv-stack-studio__status is-repo"><GitBranch /> Existing repo or new product</span>
            <span className="xv-stack-studio__status is-check"><ShieldCheck /> Checks visible</span>
          </div>
          <div className="xv-stack-studio__copy">
            <p>YOUR BRIEF</p>
            <h3>Build the product, not just the answer.</h3>
            <span>Scope, interface, data, checks, and release intent stay connected from the first request to the working result.</span>
            <Link href="/features">See how Xroga works <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </article>

        <article className="xv-stack-studio__card is-stack-card">
          <div className="xv-stack-studio__stack-visual">
            <span className="xv-stack-studio__eyebrow">YOUR STACK, ALREADY IN THE WORK</span>
            <h3>The tools and languages you may already know.</h3>
            <p>Connect authorized services. Keep building in familiar technology.</p>
            <div className="xv-stack-studio__rails">
              <small>CONNECTS WITH</small>
              <IntegrationRail />
              <small>WRITES AND WORKS IN</small>
              <LanguageRail />
            </div>
            <div className="xv-stack-studio__ready"><Check /> Built around your product, not a demo stack.</div>
          </div>
        </article>
      </div>
    </section>
  );
}
