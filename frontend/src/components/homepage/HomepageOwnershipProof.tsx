import { HomepageAudienceSlider } from './HomepageAudienceSlider';
import { HomepageBuildStrip } from './HomepageBuildStrip';

export function HomepageOwnershipProof() {
  return (
    <section className="xv-home-proof" aria-label="How Xroga fits your stack and your work">
      <div className="xv-home-proof__inner">
        <HomepageBuildStrip />
        <HomepageAudienceSlider />
      </div>
    </section>
  );
}
