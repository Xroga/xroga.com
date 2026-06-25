import { claudeGenerate } from '../../lib/anthropic.js';
import { generateImageFlux } from '../../lib/replicate.js';
import { generateImageCloudflare } from '../../lib/cloudflare.js';
import { deployStaticSite } from '../../lib/vercel.js';
import type { LandingPageOutput } from '../../types/features.js';

interface ParsedSiteCode {
  html: string;
  css: string;
  js: string;
}

const LANDING_PAGE_SYSTEM = `You are an expert web developer. Generate a complete, modern, responsive landing page.
Return ONLY valid JSON with keys: html, css, js
- html: full HTML document body content (include semantic HTML5)
- css: all styles (mobile-first, modern design)
- js: minimal interactive JS if needed
No markdown, no explanation, only JSON.`;

function generateFallbackSite(prompt: string): ParsedSiteCode {
  const title = prompt.slice(0, 60).replace(/[<>"']/g, '');
  return {
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="styles.css"></head>
<body>
<header><nav><div class="logo">Xroga</div><a href="#cta" class="btn">Get Started</a></nav></header>
<main>
<section class="hero"><h1>${title}</h1><p>Built by Xroga AI Swarm</p><a href="#cta" class="btn-primary">Start Now</a></section>
<section id="features" class="features"><div class="card"><h3>Fast</h3><p>Lightning-fast performance</p></div>
<div class="card"><h3>Modern</h3><p>Beautiful design</p></div>
<div class="card"><h3>Reliable</h3><p>Zero-defect guarantee</p></div></section>
<section id="cta" class="cta"><h2>Ready to begin?</h2><button class="btn-primary">Contact Us</button></section>
</main>
<footer><p>&copy; ${new Date().getFullYear()} Xroga</p></footer>
<script src="script.js"></script></body></html>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;color:#1a1a2e;background:#fafafa}
header nav{display:flex;justify-content:space-between;align-items:center;padding:1rem 2rem;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.hero{text-align:center;padding:6rem 2rem;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff}
.hero h1{font-size:2.5rem;margin-bottom:1rem}.hero p{font-size:1.2rem;opacity:.9;margin-bottom:2rem}
.btn-primary{display:inline-block;padding:.75rem 2rem;background:#fff;color:#7c3aed;border-radius:8px;text-decoration:none;font-weight:600;border:none;cursor:pointer}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:2rem;padding:4rem 2rem;max-width:1200px;margin:0 auto}
.card{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.cta{text-align:center;padding:4rem 2rem}.cta h2{margin-bottom:1.5rem}
footer{text-align:center;padding:2rem;color:#666}`,
    js: `document.querySelectorAll('.btn-primary').forEach(b=>b.addEventListener('click',()=>alert('Thanks for visiting!')));`,
  };
}

function parseClaudeResponse(raw: string, prompt: string): ParsedSiteCode {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ParsedSiteCode;
      if (parsed.html && parsed.css) return parsed;
    }
  } catch {
    console.error('[LandingPage] Failed to parse Claude response, using fallback');
  }
  return generateFallbackSite(prompt);
}

async function generateHeroImage(prompt: string): Promise<string> {
  const imagePrompt = `Professional hero image for: ${prompt}. Modern, high quality, web-ready.`;
  try {
    return await generateImageFlux(imagePrompt);
  } catch (replicateErr) {
    console.error('[LandingPage] Replicate hero image failed:', (replicateErr as Error).message);
    try {
      return await generateImageCloudflare(imagePrompt);
    } catch (cfErr) {
      console.error('[LandingPage] Cloudflare fallback failed:', (cfErr as Error).message);
      return 'https://placehold.co/1200x630/7c3aed/ffffff?text=Xroga+AI';
    }
  }
}

function injectHeroImage(html: string, imageUrl: string): string {
  if (html.includes('hero-image')) return html;
  const heroImg = `<img src="${imageUrl}" alt="Hero" class="hero-image" style="max-width:100%;border-radius:12px;margin-top:2rem;" />`;
  return html.replace('</section>', `${heroImg}</section>`);
}

export async function buildLandingPage(prompt: string): Promise<LandingPageOutput> {
  let siteCode: ParsedSiteCode;

  try {
    const raw = await claudeGenerate(LANDING_PAGE_SYSTEM, `Create a landing page for: ${prompt}`);
    siteCode = parseClaudeResponse(raw, prompt);
  } catch (err) {
    console.error('[LandingPage] Claude generation failed:', (err as Error).message);
    siteCode = generateFallbackSite(prompt);
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
    deployUrl = `https://preview.xroga.local/${projectName}`;
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
