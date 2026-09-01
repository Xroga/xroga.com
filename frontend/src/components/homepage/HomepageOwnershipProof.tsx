import Image from 'next/image';
import { Check, Code2, GitBranch, Rocket, Sparkles } from 'lucide-react';
import { HomepageBuildStrip } from './HomepageBuildStrip';

const PROOFS = [
  {
    index: '01',
    image: '/homepage/proof/xroga-brief-to-build-20260901.png',
    alt: 'Illustration of a written product brief becoming connected software components',
    title: 'Your brief becomes the build.',
    copy: 'Describe the outcome in plain language. Xroga plans and implements the product across the interface, code, and connected services.',
  },
  {
    index: '02',
    image: '/homepage/proof/xroga-visible-verification-20260901.png',
    alt: 'Illustration of software files passing through visible inspection and verification',
    title: 'You can inspect the work.',
    copy: 'Follow the real execution state, changed files, checks, blockers, and preview evidence instead of receiving a vague success message.',
  },
  {
    index: '03',
    image: '/homepage/proof/xroga-owned-handoff-20260901.png',
    alt: 'Illustration of source code passing through an approval checkpoint into a finished responsive product',
    title: 'The finished product stays yours.',
    copy: 'When you authorize shipping, Xroga works through your connected repository and deployment accounts. You keep the code, credentials, and control.',
  },
] as const;

export function HomepageOwnershipProof() {
  return (
    <section className="xv-home-proof" aria-labelledby="homepage-proof-heading">
      <div className="xv-home-proof__inner">
        <header className="xv-home-proof__problem">
          <p>THE REAL GAP IS AFTER THE PROMPT</p>
          <h2>
            Most ideas don&apos;t need another answer.
            <span> They need the difficult work between a prompt and a product people can actually use.</span>
          </h2>
          <small>
            Xroga plans the work, changes the code, runs the checks, and prepares the release—with you in control of every consequential step.
          </small>
        </header>

        <article className="xv-home-proof__platform-card">
          <div
            className="xv-home-proof__platform-visual"
            role="img"
            aria-label="Xroga workflow from product brief to an authorized release"
          >
            <div className="xv-home-proof__window">
              <div className="xv-home-proof__window-bar" aria-hidden="true">
                <i /><i /><i />
                <span>xroga.ai / workspace</span>
              </div>
              <div className="xv-home-proof__flow">
                <div className="xv-home-proof__brief">
                  <span>YOUR BRIEF</span>
                  <strong>Build the product, not just the answer.</strong>
                  <p>Scope, interface, data, checks, and release intent.</p>
                </div>

                <div className="xv-home-proof__core" aria-hidden="true">
                  <Sparkles />
                  <span>XROGA</span>
                </div>

                <div className="xv-home-proof__outputs" aria-hidden="true">
                  <span><GitBranch /> Plan</span>
                  <span><Code2 /> Code</span>
                  <span><Check /> Checks</span>
                  <span><Rocket /> Release</span>
                </div>
              </div>
            </div>
          </div>

          <header className="xv-home-proof__heading">
            <p>THE DIFFERENCE IS WHAT YOU KEEP</p>
            <h2 id="homepage-proof-heading">
              The work doesn&apos;t disappear <em>into a chat.</em>
            </h2>
            <span>
              Xroga turns your brief into code you can inspect, evidence you can judge, and a product you control.
            </span>
          </header>

          <HomepageBuildStrip />
        </article>

        <div className="xv-home-proof__grid">
          {PROOFS.map((proof) => (
            <article key={proof.index} className="xv-home-proof__card">
              <div className="xv-home-proof__visual">
                <Image
                  src={proof.image}
                  alt={proof.alt}
                  width={1024}
                  height={1024}
                  sizes="(max-width: 760px) 88vw, (max-width: 1100px) 44vw, 30vw"
                />
                <span aria-hidden="true">{proof.index}</span>
              </div>
              <div className="xv-home-proof__copy">
                <h3>{proof.title}</h3>
                <p>{proof.copy}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="xv-home-proof__truthline">
          <span>Real code</span>
          <i aria-hidden="true" />
          <span>Visible validation</span>
          <i aria-hidden="true" />
          <span>Authorized shipping</span>
        </p>
      </div>
    </section>
  );
}
