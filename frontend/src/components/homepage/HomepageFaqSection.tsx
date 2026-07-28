'use client';

import { useId, useState } from 'react';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What is Xroga AI?',
    a: 'Xroga AI turns supported product requests into controlled repository work, applicable validation, and provider-backed publishing through accounts you authorise. It updates the same connected project instead of starting over.',
  },
  {
    q: 'What is Black Hole V∞?',
    a: 'Black Hole V∞ is Xroga’s single customer-facing AI. Xroga selects internal capabilities automatically for comprehension, implementation, research, review, and repair. Customers never need to select or manage a provider model.',
  },
  {
    q: 'What can Xroga build from one prompt?',
    a: 'One clear prompt can start many web products, but complex systems usually require follow-up decisions, credentials, and review. Xroga reports incomplete requirements and external blockers instead of calling a partial scaffold complete.',
  },
  {
    q: 'How is this different from Cursor or Codex?',
    a: 'Cursor and Codex are built for developers who live in an IDE. Xroga is built to finish the product loop: brief → code → QA → your GitHub → live on Vercel. You can still edit the repo afterward in any IDE.',
  },
  {
    q: 'What do I get on a paid plan?',
    a: 'Xroga AI is $19 per 30-day billing period with all features included. Balanced Month pacing preserves capacity across the cycle and protects completion work. The interface shows real usage percentage, available capacity, next unlock, and reset date without exposing provider balances.',
  },
  {
    q: 'Do unused credits expire?',
    a: 'Unused daily and complexity portions roll forward within the active 30-day cycle. The included capacity resets at the end of the cycle; completed work and checkpoints remain saved.',
  },
  {
    q: 'Do I need to know how to code?',
    a: 'No for the first ship. Describe the product in plain language. Developers can still open the repo and refine — Xroga does not lock you into a black box.',
  },
  {
    q: 'Is Xroga for browser automation, image, or video studios?',
    a: 'No. Xroga is a coding agent — websites, SaaS, Expo apps, Chrome extensions, and Electron desktops to your GitHub (and Vercel for web). Not a browser-automation farm or media generation studio.',
  },
  {
    q: 'Can Xroga build Android and iOS apps?',
    a: 'Yes — Expo / React Native scaffolds. Xroga generates the project and pushes it to your GitHub. Expo Go works for free previews. Connecting Expo + starting an EAS workflow can build binaries on your account — that is not the same as App Store / Play approval. Pasting Apple/Google credentials in Xroga does not guarantee store submission; EAS must already be set up for submit.',
  },
  {
    q: 'Can Xroga ship Chrome extensions or desktop apps?',
    a: 'It builds scaffolds and packages artifacts: Chrome MV3 zip for sideload / your own CWS upload (~$5), and unsigned Electron zips on GitHub Releases for testing. It is not a managed store publisher and does not pay fees or complete store review for you.',
  },
  {
    q: 'Where is billing and support?',
    a: 'Checkout and subscriptions are handled by Lemon Squeezy. For help: hello@xroga.com or the phone on our Contact page. See Terms, Privacy, and Refund Policy in the footer.',
  },
];

export function HomepageFaqSection() {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="xv-hc-faq" aria-labelledby="faq-heading">
      <div className="xv-hc-faq-inner">
        <p className="xv-hc-pixel-kicker" id="faq-heading">
          FAQ
        </p>
        <h2 className="xv-hc-section-title">
          Straight answers. <em>No hype.</em>
        </h2>
        <p className="xv-hc-section-copy">
          What Xroga is, what one prompt can do, and how billing works — before you start.
        </p>

        <div className="xv-hc-faq-list">
          {FAQS.map((item, i) => {
            const panelId = `${baseId}-panel-${i}`;
            const btnId = `${baseId}-btn-${i}`;
            const isOpen = open === i;
            return (
              <div key={item.q} className="xv-hc-faq-item">
                <h3>
                  <button
                    type="button"
                    id={btnId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="xv-hc-faq-q"
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className="xv-hc-faq-icon" aria-hidden>
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  hidden={!isOpen}
                  className="xv-hc-faq-a"
                >
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
