'use client';

import { useId, useState } from 'react';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What is Xroga AI?',
    a: 'Xroga AI is the #1 coding agent for developers and non-developers. It builds web apps, pushes working code to your GitHub, deploys on your Vercel, syncs your API keys securely into Vercel env, and updates the same repo (edit/delete) without starting over. No coding knowledge required to start.',
  },
  {
    q: 'What is Black Hole V∞?',
    a: 'Black Hole V∞ is Xroga’s only public model. Under the hood it routes specialist cores (Apex, Horizon, Forge, Pulse, Live, Lens) — you never pick a vendor model. New capability ships as Event Horizon updates inside V∞. On the homepage, use the plan buttons to see how monthly tokens and per-core capacity scale from Spark to Singularity.',
  },
  {
    q: 'Can Xroga build anything from one prompt?',
    a: 'It can start almost any web product from one clear prompt — landing pages, dashboards, games, tools — then push GitHub and deploy. Complex systems (heavy backends, custom infra, pixel-perfect native apps) usually need follow-up prompts and your connected GitHub/Vercel. One prompt starts the ship loop; big products iterate.',
  },
  {
    q: 'How is this different from Cursor or Codex?',
    a: 'Cursor and Codex are built for developers who live in an IDE. Xroga is built to finish the product loop: brief → code → QA → your GitHub → live on Vercel. You can still edit the repo afterward in any IDE.',
  },
  {
    q: 'What do I get on a paid plan?',
    a: 'Monthly token pool and concurrency — Spark ~6.17M tokens / 2 concurrent; Pulse ~9.42M / 8; up to Singularity ~325M / 100. All features on every plan. Use the Black Hole plan changer on the homepage to preview pool + per-core capacity. Payments run through Lemon Squeezy.',
  },
  {
    q: 'Do unused credits expire?',
    a: 'Unused AI credit rolls into the next month (capped at one month of your plan budget). Tokens and spend stay synced to your account across devices.',
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
