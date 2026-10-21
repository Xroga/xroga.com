# S03 → S04 handoff

S03 is technically release-ready after V11. It is visually closed only once the founder reviews the live section. This note records what S03 owns, so S04 neither duplicates it nor breaks it.

## What S03 owns (do not repeat in S04)
- **The message:** "Get discovered. Win the customer."
- **Search & Visibility**, shown for one example business (PeakForm Nutrition):
  - technical SEO (crawl, 404, noindex, slow pages)
  - keyword research and page briefs
  - AEO/GEO product discovery in AI answers
  - backlinks and digital PR (the link-gap graph)
  - local SEO
- **Launch & Marketing**, shown for Ember Roasters:
  - launch kit
  - Google search ads (ad groups, negatives, proposed cap, review)
  - social creative by audience and placement
  - conversion paths by channel
- **The pattern:** checks → finds a gap → prepares the work → asks before anything goes live → re-checks where it genuinely can.
- **Provider identities in context** for Ahrefs, Semrush, Search Console, Business Profile, Google Ads, Meta, Google Analytics, Tag Manager and HubSpot, with directory-accurate availability.

## Invariants S04 must keep
1. **One section:** S03 stays one `<section id="s03">` with two modes and one stage. It sits between S02 (`<S02Work>`) and `HomepagePowerStories`.
2. **Global CSS:** global homepage CSS must not change S03 transforms. The button lift in `styles/homepage-coding.css` excludes S03 with `:where(:not(#s03 *))`. Any new global hover, active or transition rule for buttons needs the same exclusion, or S03 controls vibrate again (BUG-01).
3. **The guided tour:**
   - Autoplays only once, when S03's stage is half visible, on screens at least 701 px wide, without reduced motion.
   - Any click or key in S03 stops it.
   - S04 must not scroll the page, steal focus or dispatch input into S03.
4. **Fictional data:** S03 data is fictional (`.example` domains; Leeds drama-range phone number). S04 should not reuse PeakForm or Ember Roasters as if they were real customers.
5. **Nothing implies live activity:** no provider is shown as connected; nothing is published, sent, spent, crawled or measured live. S04 must not contradict this, for example by claiming live AI-visibility tracking, unless that capability exists in production.
6. **Header shield:** S03 owns its header shield (`data-under`). S04 should use its own shield if it needs one.

## Known limits carried forward
- Verified in Chromium only (Playwright). Safari and Firefox were not available in the build environment.
- At 1440×900 the bottom of the stage sits slightly below the fold during tour beats that open a draft.
- The homepage-wide red issue badge visible in local screenshots comes from outside S03; it isn't part of this section.
