import { claudeGenerate } from '../../lib/anthropic.js';
import { generateImageFlux } from '../../lib/replicate.js';
import { generateImageCloudflare } from '../../lib/cloudflare.js';
import { deployStaticSite } from '../../lib/vercel.js';
import type { LandingPageOutput } from '../../types/features.js';
import { looksLikeGenericFallbackSite } from '../../lib/blogSiteTemplate.js';
import {
  generatePromptMatchedSite,
  heroPlaceholderForPrompt,
  scaffoldKindForPrompt,
} from '../../lib/promptSiteScaffold.js';

interface ParsedSiteCode {
  html: string;
  css: string;
  js: string;
}

const LANDING_PAGE_SYSTEM = `You are an expert web developer. Generate a complete, modern, responsive product matching the user's request EXACTLY.
- Crypto / DeFi / dashboard → interactive dashboard (KPI cards, charts, tables, wallet/swap UI) — NOT a blog
- SaaS → product landing + app shell cues — NOT a blog
- Marketplace / portfolio / chatbot / game → those products — NOT a blog
- Blog ONLY if the user asked for a blog/journal/newsletter
NEVER ship the old generic "Fast / Modern / Reliable" Xroga marketing stub.
NEVER put the raw user prompt into the H1.
Return ONLY valid JSON with keys: html, css, js
- html: full HTML document (DOCTYPE) or body with semantic sections
- css: complete mobile-first CSS with @media queries
- js: working interactions (nav, tabs, forms, charts stubs)
No markdown, no explanation, only JSON.`;

/** Public — used by Escape Pod / assemblers when LLMs fail. */
export function generateFallbackSite(prompt: string): ParsedSiteCode {
  return generatePromptMatchedSite(prompt);
}

function parseClaudeResponse(raw: string, prompt: string): ParsedSiteCode {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ParsedSiteCode;
      if (parsed.html && parsed.css) {
        if (looksLikeGenericFallbackSite(parsed.html, parsed.css)) {
          return generatePromptMatchedSite(prompt);
        }
        return parsed;
      }
    }
  } catch {
    console.error('[LandingPage] Failed to parse Claude response, using prompt-matched scaffold');
  }
  return generatePromptMatchedSite(prompt);
}

async function generateHeroImage(prompt: string): Promise<string> {
  const kind = scaffoldKindForPrompt(prompt);
  const imagePrompt =
    kind === 'blog'
      ? `Editorial hero photograph for a tasteful blog homepage about: ${prompt}. Soft natural light, no text overlay.`
      : `Product UI atmosphere photo for a ${kind} web product: ${prompt}. Clean modern interface mood, no text overlay.`;
  try {
    return await generateImageFlux(imagePrompt);
  } catch (replicateErr) {
    console.error('[LandingPage] Replicate hero image failed:', (replicateErr as Error).message);
    try {
      return await generateImageCloudflare(imagePrompt);
    } catch (cfErr) {
      console.error('[LandingPage] Cloudflare fallback failed:', (cfErr as Error).message);
      return heroPlaceholderForPrompt(prompt);
    }
  }
}

function injectHeroImage(html: string, imageUrl: string): string {
  if (html.includes('hero-image') || html.includes(imageUrl)) return html;
  // Prefer not to inject into blog templates that already have a designed hero
  if (/class="hero"/i.test(html) && /post-grid/i.test(html)) return html;
  const heroImg = `<img src="${imageUrl}" alt="Hero" class="hero-image" style="max-width:100%;border-radius:12px;margin-top:2rem;" />`;
  return html.replace('</section>', `${heroImg}</section>`);
}

export async function buildLandingPage(prompt: string): Promise<LandingPageOutput> {
  let siteCode: ParsedSiteCode;

  try {
    const raw = await claudeGenerate(
      LANDING_PAGE_SYSTEM,
      `Create the product/site for: ${prompt}\n\nMatch the product type exactly (dashboard/crypto/saas/etc). Blog only if they asked for a blog. Never a purple Fast/Modern/Reliable stub.`
    );
    siteCode = parseClaudeResponse(raw, prompt);
  } catch (err) {
    console.error('[LandingPage] Claude generation failed:', (err as Error).message);
    siteCode = generatePromptMatchedSite(prompt);
  }

  if (looksLikeGenericFallbackSite(siteCode.html, siteCode.css)) {
    siteCode = generatePromptMatchedSite(prompt);
  }

  const heroImageUrl = await generateHeroImage(prompt);
  const htmlWithHero = injectHeroImage(siteCode.html, heroImageUrl);

  const projectName = `xroga-${prompt.slice(0, 20).replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;

  let deployUrl = `https://${projectName}.vercel.app`;
  let vercelDeploymentId: string | undefined;

  try {
    const fullHtml = htmlWithHero.includes('<!DOCTYPE')
      ? htmlWithHero
      : `<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body>${htmlWithHero}<script src="script.js"></script></body></html>`;

    const deployment = await deployStaticSite(projectName, [
      { file: 'index.html', data: fullHtml },
      { file: 'styles.css', data: siteCode.css },
      { file: 'script.js', data: siteCode.js },
    ]);
    deployUrl = deployment.deployUrl;
    vercelDeploymentId = deployment.deploymentId;
  } catch (err) {
    console.error('[LandingPage] Vercel deploy failed:', (err as Error).message);
    deployUrl = '';
  }

  return {
    type: 'landing_page',
    html: htmlWithHero,
    css: siteCode.css,
    js: siteCode.js,
    heroImageUrl,
    deployUrl,
    vercelDeploymentId,
  };
}
