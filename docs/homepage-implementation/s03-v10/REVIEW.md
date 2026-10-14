# S03 V10: unified Search & Growth

V10 keeps the approved V9 art and scenes, and changes how S03 is structured and explained. S03 is now one section with two selectable modes on one shared stage. A short guided demonstration plays first, so a visitor sees Xroga work before having to learn any controls.

## Recording review (V9, 89.9 s)
I inspected the supplied V9 recording through FFmpeg contact sheets.

Defects confirmed:
- S03 was two stacked chapters, each with its own heading. The second business example arrived only after about 42 s of scrolling.
- Nothing happened until the visitor clicked.
- AI answers used "Sample 1/2/3".
- The lens names were technical-first.
- The "illustrative" caveats were repeated.

## Preserved from V9
- The dark-titanium atmosphere, the type scale and the mint (search) and apricot (marketing) accents.
- **Search & Visibility:**
  - The site-health crawl map, with its single tracer pass and issues on their exact links.
  - The keyword intent clusters and the competitor-versus-empty-slot comparison.
  - The citation threads and source cards in AI answers.
  - The backlink graph: verified edges to the site, competitor-only edges to the competitor, a mention as an open line, prospects with no line, and the excluded paid-link source.
  - The local map and listing completeness.
- **Launch & Marketing:**
  - The launch kit.
  - The Google Ads campaign → ad group → keywords → ad → landing page chain, including the negatives, budget and review.
  - The Meta feed and story creatives, which change with the audience.
  - The channel ribbons into Conversions.
- **Shared:**
  - The inspectors, the phone bottom sheet and the provider chips placed beside the work they support, with honest availability.
  - The header shield, focus rings and reduced-motion rules.
- S00, S01 and S02 are unchanged; see VERIFICATION.md.

## Changed in V10
| Area | V9 | V10 |
|---|---|---|
| Structure | Two chapters (`<section>` plus heading each), with door cards that scroll to them | One `<section id="s03">`, one heading, a two-option mode selector (`role=tablist`) above one shared stage (`#s03-stage`) |
| Headline | "Getting found is work. So is winning the customer." | "Get discovered. Win the customer." Lede: "Xroga finds what stops people finding you, prepares the marketing that brings them in, and asks before anything goes live." |
| First visit | Static; needs clicks | A guided tour of 11 beats (about 25 s) drives the real components through both modes, then hands over ("Your turn") |
| Lens names | Site health / Keywords & content / AI answers / Authority & links / Local presence | Fix my website / Find search opportunities / Appear in AI answers / Earn authority / Show up locally, each with its expert term as a subtitle (Technical SEO, Keywords & content, AEO · GEO, Backlinks & digital PR, Local SEO) |
| AI answers | Sample 1 / 2 / 3 | Three real questions: "Repair today", "What it costs" and "Who is nearby". Each has its own answer, cited sources, Northlane's status and a "why". The draft is labelled "Proposed page change · draft" |
| Disclosure | Repeated "illustrative" notes | One "Interactive preview" button opens a single note |
| Height | Two full chapters stacked | One stage of about 510 px at 1440 px. Header, mode selector, tour caption and most of the stage fit in the first 1440×900 view |

## The guided tour (tourBeats.ts, Tour.tsx)
- **Trigger:** plays once, when the stage is at least 50% visible, on screens at least 701 px wide, and only when reduced motion is off.
- **Phones and reduced motion:** never autoplays. "Watch Xroga work" starts it on request.
- **Interruption:** any pointer or key input inside S03 stops it at once and keeps the visitor's choice; Tab and Shift do not. Hover never stops it.
- **Input before the tour starts** cancels autoplay for good.
- **Pausing:** pauses below 20% visibility and while the page is hidden, then resumes the same beat.
- **Controls:** Skip, plus Replay after it ends or is interrupted.
- **Captions:** each beat has a short, stage-labelled caption in an `aria-live` region: Noticed, Prepared or For review.
- **Honesty:** the tour dispatches the same reducer actions a visitor would. It never publishes, sends, verifies or spends; a unit test checks this.

| # | Mode | Caption (measured on the production build, see contact sheets) |
|---|---|---|
| 1 | Search | NOTICED · A service page can’t be reached. (the crawl tracer finds the 404) |
| 2 | Search | PREPARED · Fix the path customers need. (repair preview, not applied) |
| 3 | Search | NOTICED · People are looking. Your page is missing. (buying query, then a draft brief) |
| 4 | Search | NOTICED · AI answers cite other sources. (real question, cited and conflicting sources, then a draft page change) |
| 5 | Search | NOTICED · Competitors have links you don’t. (competitor gap graph) |
| 6 | Search | PREPARED · An outreach pitch, ready for your review. (draft; no new link edge) |
| 7 | Search | FOR REVIEW · Your local listing needs attention. (draft listing update) |
| 8 | Marketing | PREPARED · Turn an offer into a launch plan. (positioning, then the launch page) |
| 9 | Marketing | PREPARED · Target real buyers. Exclude the wrong searches. (negative keywords) |
| 10 | Marketing | PREPARED · One offer. The right message for each channel. (feed, then story) |
| 11 | Marketing | FOR REVIEW · See where interest becomes customers. (search, then social path) |

## Provider truth
The provider chips are unchanged from V9 and appear only beside the work they support. Each chip shows the provider's status in Xroga's integration directory:
- **Listed as available to connect:** Ahrefs, Semrush, Google Ads, Meta, HubSpot and Google Analytics.
- **Shown as "Not in directory · example":** Search Console, Tag Manager and Business Profile.
- **AI answers:** says no AI-answer data provider is in the directory.
- No chip claims a connected account.

## Internal evaluation (not user research)
No user testing took place. This is my own review of the rendered frames.
- **At 3 s:** the 1440 first frame shows the headline, the two modes ("Find what stops people finding you" / "Put your offer in front of the right people") and the caption "A service page can’t be reached." over a live crawl map. Both value propositions are readable without any clicks.
- **Remaining risk:** during beats with a draft card, the bottom of the stage sits slightly below the 900 px fold at 1440×900.
