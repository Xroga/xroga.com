import Image from 'next/image';
import { HomepageBuildStrip } from './HomepageBuildStrip';

export function HomepageOwnershipProof() {
  return (
    <section className="xv-home-proof" aria-label="What Xroga builds and how a brief becomes software">
      <div className="xv-home-proof__inner">
        <div className="xv-home-proof__compact-row">
          <HomepageBuildStrip />

          <article className="xv-home-proof__brief-card">
            <div className="xv-home-proof__brief-visual">
              <Image
                src="/homepage/proof/xroga-brief-to-build-20260901.png"
                alt="Illustration of a written product brief becoming connected software components"
                width={1024}
                height={1024}
                sizes="(max-width: 760px) 88vw, 42vw"
              />
            </div>

            <div className="xv-home-proof__brief-copy">
              <p>FROM BRIEF TO WORKING PRODUCT</p>
              <h2>Your brief becomes the build.</h2>
              <span>
                Start a fresh product or connect an existing repository. Xroga can plan and implement the interface,
                code, data, connected services, checks, and release work without taking control away from you.
              </span>

              <div className="xv-home-proof__brief-note">
                <small>YOUR BRIEF</small>
                <strong>Build the product, not just the answer.</strong>
                <span>Scope, interface, data, checks, and release intent.</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
