import Image from 'next/image';

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
        <header className="xv-home-proof__heading">
          <p>THE DIFFERENCE IS WHAT YOU KEEP</p>
          <h2 id="homepage-proof-heading">
            The work doesn&apos;t disappear <em>into a chat.</em>
          </h2>
          <span>
            Xroga turns your brief into code you can inspect, evidence you can judge, and a product you control.
          </span>
        </header>

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
