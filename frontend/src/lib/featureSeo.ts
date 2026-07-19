/**
 * Public SEO landing pages for Xroga AI capabilities.
 * Each slug maps to /features/[slug] with dedicated metadata + JSON-LD.
 */

export interface FeatureSeoPage {
  slug: string;
  title: string;
  headline: string;
  description: string;
  keywords: string[];
  bullets: string[];
  faq: Array<{ q: string; a: string }>;
  relatedSlugs: string[];
}

export const FEATURE_SEO_PAGES: FeatureSeoPage[] = [
  {
    slug: 'ai-image-generation',
    title: 'AI Image Generation',
    headline: 'AI Image Generation — Create Stunning Visuals with Xroga AI',
    description:
      'Generate photorealistic images, thumbnails, logos, and art with Xroga AI. Multi-model image swarm, variants, editing, and instant download — the best AI image generator for creators and developers.',
    keywords: [
      'AI image generation',
      'AI image generator',
      'text to image AI',
      'Xroga image AI',
      'best AI image tool',
      'AI art generator',
      'AI thumbnail maker',
      'generate images with AI',
    ],
    bullets: [
      'Text-to-image with multiple AI models and automatic best-result selection',
      'Image editing, variants, aspect ratios, and studio-grade exports',
      'Thumbnails, logos, social posts, and marketing creatives in one chat',
      'Saved to your media gallery — reuse across web builds and chat projects',
    ],
    faq: [
      { q: 'Can Xroga AI generate images from text?', a: 'Yes. Describe what you want in the chat and Xroga routes your prompt to elite image models with quality verification.' },
      { q: 'Is AI image generation included on all plans?', a: 'Yes. Every Xroga plan includes the full feature stack; images use your monthly token quota.' },
    ],
    relatedSlugs: ['ai-chat', 'build-websites-apps-games', 'xroga-workspace'],
  },
  {
    slug: 'ai-chat',
    title: 'AI Coding Agent Chat',
    headline: 'Chat with Xroga — the #1 Coding Agent for Builders & Beginners',
    description:
      'Chat with Xroga AI, the #1 coding agent. Ask in plain language to build websites and web apps, push to GitHub, deploy on Vercel, and update your repo — whether you are a developer or have no coding knowledge.',
    keywords: [
      'AI chat',
      'AI coding agent chat',
      'Xroga chat',
      'AI coding assistant',
      'chat to build website',
      'AI for non developers chat',
      'chat with AI',
      'AI coding chat',
    ],
    bullets: [
      'Plain-language chat that can turn into a real web build',
      'Works for developers and people with no coding knowledge',
      'Upload images/docs for analysis, then ship from Workspace',
      'Continue into GitHub push and Vercel deploy from the same flow',
    ],
    faq: [
      {
        q: 'How is Xroga chat different from ChatGPT?',
        a: 'ChatGPT answers. Xroga is a coding agent that can build web apps, push to your GitHub, and deploy on your Vercel.',
      },
      {
        q: 'Can beginners use it?',
        a: 'Yes. Describe what you want in everyday language — no coding knowledge required to start.',
      },
    ],
    relatedSlugs: ['xroga-workspace', 'build-websites-apps-games', 'github-auto-deploy'],
  },
  {
    slug: 'ai-voice-talk',
    title: 'Talk with AI — Voice Assistant',
    headline: 'Talk with AI — Push-to-Talk Voice on Xroga AI',
    description:
      'Speak naturally with Xroga Voice — push-to-talk AI with human-like speech, live web search via Tavily, Groq Whisper STT, and Edge TTS. Ask questions hands-free on xroga.com.',
    keywords: [
      'talk with AI',
      'AI voice assistant',
      'voice AI chat',
      'push to talk AI',
      'Xroga voice',
      'AI speech assistant',
      'voice chatbot',
      'hands-free AI',
    ],
    bullets: [
      'Tap Talk — full-screen voice UI with glowing orb and live captions',
      'Groq Whisper listens; Groq Llama thinks; Edge TTS speaks naturally',
      'Live web search for weather, news, stocks, and current events',
      'Cancel, close, mute, and conversation history in one overlay',
    ],
    faq: [
      { q: 'Does Xroga have voice talk?', a: 'Yes. Click Talk in the header to open the voice overlay — sign in and allow microphone access.' },
      { q: 'Does voice search the web?', a: 'Yes. Time-sensitive questions trigger Tavily search before the AI speaks an answer.' },
    ],
    relatedSlugs: ['ai-chat', 'ai-image-generation', 'integrations'],
  },
  {
    slug: 'build-websites-apps-games',
    title: 'Build Websites, Web Apps & Games',
    headline: 'Build Websites & Web Apps with AI — No Coding Knowledge Required',
    description:
      'Xroga AI is the #1 coding agent for developers and non-developers. Describe a website, dashboard, or browser game in plain language — Xroga builds working code, pushes to your GitHub, deploys on your Vercel, and updates the same repo (edit/delete) without starting over.',
    keywords: [
      'AI build website',
      'AI web app builder',
      'AI coding agent',
      'build website with AI no code',
      'AI code generation',
      'Xroga build apps',
      'AI landing page builder',
      'no-code AI developer',
      'AI for non developers',
    ],
    bullets: [
      'Prompt → working web app for beginners and developers',
      'Push to your GitHub — edit, update, and delete on the same repo',
      'Deploy live on your Vercel account',
      'Secure API keys synced into Vercel env for your product',
    ],
    faq: [
      {
        q: 'Can Xroga build a full website?',
        a: 'Yes. Describe your project in plain language. Xroga generates working web code, can push to GitHub, and deploy on Vercel.',
      },
      {
        q: 'Do I need to know how to code?',
        a: 'No. Non-developers can ship a first version from a prompt. Developers can open the same GitHub repo to refine.',
      },
    ],
    relatedSlugs: ['github-auto-deploy', 'code-debugging', 'vercel-netlify-deploy'],
  },
  {
    slug: 'code-debugging',
    title: 'AI Code Debugging',
    headline: 'AI Debugging — Find and Fix Bugs with Xroga Swarm',
    description:
      'Debug faster with Xroga AI — paste errors, stack traces, or broken code and the swarm identifies root causes, suggests fixes, and verifies syntax across Groq, Gemini, and Mistral reviewers.',
    keywords: [
      'AI debugging',
      'AI fix code',
      'debug code with AI',
      'Xroga debugging',
      'AI error fix',
      'code review AI',
      'AI syntax checker',
      'fix bugs with AI',
    ],
    bullets: [
      'Paste errors or upload files — swarm routes to debug specialists',
      'Multi-model verification catches syntax, imports, and logic issues',
      'Step-by-step explanations in plain language',
      'Works with JavaScript, TypeScript, Python, and full project repos',
    ],
    faq: [
      { q: 'Can Xroga fix my code errors?', a: 'Yes. Paste the error message or code snippet and ask Xroga to debug — the swarm runs verification passes.' },
      { q: 'Is debugging included?', a: 'Yes. Debugging uses the same token quota as chat and build on all plans.' },
    ],
    relatedSlugs: ['build-websites-apps-games', 'github-auto-deploy', 'ai-chat'],
  },
  {
    slug: 'github-auto-deploy',
    title: 'GitHub Connect & Auto Deploy',
    headline: 'GitHub Integration — Push Working Code & Keep Updating the Same Repo',
    description:
      'Connect GitHub to Xroga AI coding agent — OAuth in one click, push working web-app code, then edit, update, or delete files in the same repo without starting over. For developers and non-developers.',
    keywords: [
      'GitHub AI integration',
      'AI GitHub deploy',
      'connect GitHub AI',
      'Xroga GitHub',
      'auto push GitHub AI',
      'AI code to GitHub',
      'update GitHub repo with AI',
      'GitHub OAuth AI builder',
    ],
    bullets: [
      'GitHub OAuth — connect once, ship repeatedly',
      'Push working code after builds',
      'Edit, update, and delete files in the same repo',
      'Pairs with Vercel deploy for a full ship loop',
    ],
    faq: [
      { q: 'Does Xroga connect to GitHub?', a: 'Yes. Connect from Workspace or Integrations, then Xroga can push and update your repos.' },
      { q: 'Can Xroga update an existing repo?', a: 'Yes. It can edit, update, and delete files in your current project without rebuilding from scratch.' },
    ],
    relatedSlugs: ['vercel-netlify-deploy', 'build-websites-apps-games', 'integrations'],
  },
  {
    slug: 'vercel-netlify-deploy',
    title: 'Vercel & Netlify Deploy',
    headline: 'Deploy on Your Vercel — Live from the Coding Agent',
    description:
      'Xroga AI deploys your web apps on your Vercel account after GitHub push — live URLs, secure API key sync into Vercel env, and redeploy when you update the same repo. For developers and non-developers.',
    keywords: [
      'AI Vercel deploy',
      'Xroga deploy',
      'live preview AI',
      'deploy website AI',
      'Vercel AI builder',
      'sync API keys Vercel',
      'automatic deploy AI',
    ],
    bullets: [
      'GitHub push → Vercel deploy → live URL',
      'Sync product API keys securely into Vercel env',
      'Preview in Workspace before and after ship',
      'Redeploy when you edit the same repo',
    ],
    faq: [
      { q: 'Does Xroga deploy to Vercel?', a: 'Yes. After GitHub push, Xroga can deploy on your Vercel and show the live URL.' },
      { q: 'Can it sync API keys?', a: 'Yes. Store keys in the encrypted vault and sync them into your Vercel project env — never commit secrets to GitHub.' },
    ],
    relatedSlugs: ['github-auto-deploy', 'build-websites-apps-games', 'integrations'],
  },
  {
    slug: 'integrations',
    title: 'GitHub, Vercel & API Keys',
    headline: 'Integrations — GitHub, Vercel & Secure API Keys for Your Product',
    description:
      'Connect GitHub and Vercel to Xroga AI. Push working code, deploy live, and sync your product API keys securely into Vercel env — built for the #1 coding agent ship loop.',
    keywords: [
      'Xroga integrations',
      'AI coding agent integrations',
      'GitHub Vercel Stripe AI',
      'sync API keys Vercel',
      'connect tools AI',
      'best AI integration hub',
    ],
    bullets: [
      'GitHub OAuth — push and update the same repo',
      'Vercel deploy from Xroga Workspace',
      'Encrypted API key vault synced into Vercel env',
      'Works for developers and people with no coding knowledge',
    ],
    faq: [
      {
        q: 'Which integrations matter most?',
        a: 'GitHub and Vercel power the ship loop. Add your product API keys so Xroga can sync them securely into Vercel env.',
      },
      {
        q: 'Can I add my own API keys?',
        a: 'Yes. Store keys in the encrypted vault and sync them to your Vercel project — never commit secrets to GitHub.',
      },
    ],
    relatedSlugs: ['github-auto-deploy', 'vercel-netlify-deploy', 'ai-chat'],
  },
  {
    slug: 'ai-video-generation',
    title: 'Not a Video Tool — Coding Agent',
    headline: 'Xroga Builds Web Apps — Not Videos',
    description:
      'Xroga AI is the #1 coding agent for web apps on GitHub and Vercel — not a video generator. Describe your product in plain language; get working code, deploy live, and iterate in the same repo. For developers and non-developers.',
    keywords: [
      'Xroga coding agent',
      'build web apps with AI',
      'GitHub Vercel AI',
      'no-code web builder',
      'AI for non developers',
    ],
    bullets: [
      'Focus: websites and web apps, not video generation',
      'Push working code to your GitHub',
      'Deploy live on your Vercel',
      'Update the same repo without starting over',
    ],
    faq: [
      {
        q: 'Can Xroga generate videos?',
        a: 'No. Xroga is a coding agent for web apps — GitHub + Vercel. For visuals today, use AI image generation or build a site that embeds your own video player.',
      },
    ],
    relatedSlugs: ['build-websites-apps-games', 'ai-chat', 'xroga-workspace'],
  },
  {
    slug: 'browser-automation',
    title: 'Ship Web Apps — Not Browser Bots',
    headline: 'Xroga Ships Web Apps to GitHub & Vercel',
    description:
      'Xroga AI builds and deploys web apps to your GitHub and Vercel — for developers and non-developers. It is a coding agent ship loop, not a browser-automation product. Prompt → code → live site → edit the same repo.',
    keywords: [
      'Xroga AI',
      'AI web app builder',
      'deploy Vercel',
      'coding agent for everyone',
      'AI website builder',
      'no coding knowledge AI',
    ],
    bullets: [
      'Plain-language builds for beginners and developers',
      'Working code on your GitHub',
      'Live deploy on your Vercel',
      'Edit, update, and delete in the same project',
    ],
    faq: [
      {
        q: 'Is Xroga a browser automation tool?',
        a: 'No. Xroga is a coding agent that builds web apps and ships them to your GitHub and Vercel.',
      },
    ],
    relatedSlugs: ['ai-chat', 'build-websites-apps-games', 'xroga-workspace'],
  },
  {
    slug: 'xroga-workspace',
    title: 'Xroga Workspace — #1 Coding Agent',
    headline: 'Xroga Workspace — #1 Coding Agent for Developers & Non-Developers',
    description:
      'Xroga Workspace is where the #1 coding agent builds and ships. Describe a web product in plain language — preview in Workspace, push working code to your GitHub, deploy on your Vercel, sync API keys securely into Vercel env, and update the same repo (edit/delete) without starting over. No coding knowledge required to start.',
    keywords: [
      'Xroga workspace',
      'AI coding agent workspace',
      'AI workspace',
      'AI terminal',
      'AI coding workspace',
      'build website no code AI',
      'GitHub Vercel AI workspace',
      'update GitHub repo with AI',
      'best AI coding agent 2026',
      'AI for non developers',
    ],
    bullets: [
      'Plain-language prompts for beginners — full control for developers',
      'Push working code to your GitHub and keep updating that repo',
      'Deploy live on your Vercel; sync product API keys into env securely',
      'Edit, update, and delete files without rebuilding from scratch',
    ],
    faq: [
      {
        q: 'What is the Xroga Workspace?',
        a: 'It is the home of Xroga’s coding agent — chat, build, preview, push to GitHub, and deploy to Vercel in one place. Built for developers and people with no coding knowledge.',
      },
      {
        q: 'Do I need coding experience?',
        a: 'No. Non-developers can describe a website or web app and ship a first version. Developers can open the GitHub repo and continue in any IDE.',
      },
    ],
    relatedSlugs: ['ai-chat', 'github-auto-deploy', 'vercel-netlify-deploy'],
  },
  {
    slug: 'community-hub',
    title: 'Community Hub',
    headline: 'Xroga Community — Influencers, Referrals, Marketplace & XRG Rewards',
    description:
      'Join the Xroga community hub — earn XRG tokens, refer users for instant token bonuses, apply as an influencer, and buy templates in the live marketplace. Built for creators, builders, and power users.',
    keywords: [
      'Xroga community',
      'AI community hub',
      'Xroga referrals',
      'Xroga influencer program',
      'earn XRG tokens',
      'AI marketplace',
      'refer friends AI tokens',
      'Xroga creator program',
    ],
    bullets: [
      'Referral rewards — 250K AI tokens + 5K XRG for you and your friend',
      'Influencer tiers from Bronze to Diamond with exclusive perks',
      'Community marketplace — buy and sell templates with XRG',
      'Auto token distribution pool for active community members',
    ],
    faq: [
      { q: 'How do Xroga referrals work?', a: 'Share your referral link. When a friend signs up, you both receive 250K AI tokens and 5K XRG instantly, plus retention bonuses.' },
      { q: 'What is the influencer program?', a: 'Apply in the Community hub. Approved influencers get tiered rewards, early access, and revenue share on referrals.' },
    ],
    relatedSlugs: ['earn-xrg-referrals', 'xroga-workspace', 'integrations'],
  },
  {
    slug: 'earn-xrg-referrals',
    title: 'Earn XRG & Referrals',
    headline: 'Earn XRG Tokens — Tasks, Referrals & Community Rewards on Xroga',
    description:
      'Earn XRG on Xroga AI — complete daily tasks, refer users for instant token bonuses, unlock consistency rewards, and stack referral discounts. Tokens power AI; XRG powers the future ecosystem.',
    keywords: [
      'earn XRG',
      'Xroga earn tokens',
      'AI referral program',
      'refer and earn AI',
      'Xroga tasks rewards',
      'free AI tokens referral',
      'XRG crypto rewards',
      'earn tokens AI platform',
    ],
    bullets: [
      'Daily, weekly, and monthly tasks with XRG + token boost rewards',
      'Referral link — 250K AI tokens + 5K XRG per successful signup',
      'Retention bonuses and stacked referral discounts',
      'XRG vests over 30 days — future exchange, staking, and marketplace use',
    ],
    faq: [
      { q: 'What is XRG?', a: 'XRG is Xroga\'s community reward token. Earn it through tasks and referrals; use it in the marketplace and future ecosystem features.' },
      { q: 'Do referrals give AI tokens or actions?', a: 'Referrals give AI tokens (250K) and XRG (5K) — not legacy action credits. Tokens power all AI features.' },
    ],
    relatedSlugs: ['community-hub', 'xroga-workspace', 'ai-chat'],
  },
];

export function getAllFeatureSlugs(): string[] {
  return FEATURE_SEO_PAGES.map((p) => p.slug);
}

export function getFeatureBySlug(slug: string): FeatureSeoPage | undefined {
  return FEATURE_SEO_PAGES.find((p) => p.slug === slug);
}
