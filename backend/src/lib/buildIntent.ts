/**
 * Shared build-intent detection — keep chat from answering "how to build a blog"
 * essays when the user asked Xroga to actually build the site.
 */

const BUILD_VERB =
  /\b(build|building|create|creating|make|making|develop|developing|design|designing|launch|launching|scaffold|generate|generating)\b/i;

const BUILD_TARGET =
  /\b(website|web\s*sites?|web\s*pages?|landing\s*pages?|sites?|web\s*apps?|blogs?|portfolios?|shop|store|e[\s-]?commerce|restaurant|bakery|saas|crm|dashboard|marketplace|platform|chatbots?|software|games?|apps?|applications?|apis?|crypto|web3|defi|nft|dapp)\b/i;

/** Strong: verb near a buildable product (blog counts — classic failure case). */
const STRONG_BUILD =
  /\b(build|building|create|creating|make|making|generate|generating|develop|developing)\b[\s\S]{0,100}\b(website|web\s*app|web\s*page|landing|site|blog|portfolio|coffee|shop|store|restaurant|bakery|salon|app|game|software|api|saas|dashboard|crm|marketplace)\b/i;

const NON_BUILD_MEDIA =
  /\b(generate|create|make|draw)\b[\s\S]{0,40}\b(image|picture|photo|logo|thumbnail|video|film|clip|research report|resume|cover letter)\b/i;

/** User wants Xroga to produce a real site/app — not a how-to essay. */
export function isProductBuildRequest(prompt: string): boolean {
  const t = prompt.trim();
  if (!t) return false;
  if (NON_BUILD_MEDIA.test(t) && !BUILD_TARGET.test(t)) return false;
  if (STRONG_BUILD.test(t)) return true;
  if (BUILD_VERB.test(t) && BUILD_TARGET.test(t)) return true;
  // "a simple blog website about AI" without an explicit verb — still a build ask when short
  if (
    t.length < 160 &&
    /\b(simple\s+)?(blog|landing|portfolio)\s+(website|site|page)\b/i.test(t) &&
    /\b(about|for|with)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** True when model output is a how-to article instead of HTML/CSS/JS code. */
export function looksLikeBuildEssay(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 400) return false;
  const hasCode =
    /```(?:html|css|javascript|js)/i.test(t) ||
    /<!DOCTYPE\s+html/i.test(t) ||
    /<html[\s>]/i.test(t);
  const essaySignals =
    /\b(introduction|planning and designing|choosing a website builder|content strategy|seo and accessibility|conclusion and next steps|in this guide|walk you through)\b/i.test(
      t
    ) ||
    (t.match(/\n#{1,3}\s+/g)?.length ?? 0) >= 3 ||
    (t.match(/\n[A-Z][A-Za-z ]{8,60}\n/g)?.length ?? 0) >= 4;
  if (essaySignals && !hasCode) return true;
  // Essay with a tiny HTML sample at the end (classic failure mode)
  if (essaySignals && hasCode) {
    const codeLen = (t.match(/```[\s\S]*?```/g) ?? []).join('').length + (t.match(/<!DOCTYPE[\s\S]*?<\/html>/i)?.[0]?.length ?? 0);
    if (codeLen < t.length * 0.35) return true;
  }
  return false;
}
