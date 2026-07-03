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
      'Saved to your media gallery — reuse across video and chat projects',
    ],
    faq: [
      { q: 'Can Xroga AI generate images from text?', a: 'Yes. Describe what you want in the chat and Xroga routes your prompt to elite image models with quality verification.' },
      { q: 'Is AI image generation included on all plans?', a: 'Yes. Every Xroga plan includes the full feature stack; images use your action balance.' },
    ],
    relatedSlugs: ['ai-chat', 'ai-video-generation', 'build-websites-apps-games'],
  },
  {
    slug: 'ai-chat',
    title: 'AI Chat & Swarm Assistant',
    headline: 'AI Chat — Multi-Agent Swarm That Builds, Thinks, and Delivers',
    description:
      'Chat with Xroga AI — a multi-agent swarm OS for code, research, media, and automation. Smarter than a single chatbot: Architect, Builder, Reviewer, and QA agents work together in one conversation.',
    keywords: [
      'AI chat',
      'AI assistant',
      'Xroga chat',
      'multi-agent AI chat',
      'best AI chatbot',
      'AI swarm chat',
      'chat with AI',
      'AI coding chat',
    ],
    bullets: [
      'Natural chat with swarm phases, todos, and live progress',
      'Paste images, files, and long prompts — smart routing to the right AI',
      'Follow-up suggestions, reasoning, and branded step-by-step delivery',
      'Incognito mode and chat history across dashboard sessions',
    ],
    faq: [
      { q: 'How is Xroga chat different from ChatGPT?', a: 'Xroga uses a multi-agent swarm with specialized phases for planning, building, review, and deploy — not a single generic reply.' },
      { q: 'Can I chat for free?', a: 'New accounts get free actions to try chat, image, and build features on xroga.com.' },
    ],
    relatedSlugs: ['ai-voice-talk', 'code-debugging', 'ai-image-generation'],
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
    title: 'Build Websites, Apps & Games',
    headline: 'Build Websites, Mobile Apps, Games & Software with AI',
    description:
      'Xroga AI builds production websites, mobile apps, games, and software from a single prompt. Multi-agent swarm writes code, reviews quality, and deploys live previews — the #1 AI app builder.',
    keywords: [
      'AI build website',
      'AI app builder',
      'AI game generator',
      'build software with AI',
      'AI code generation',
      'Xroga build apps',
      'AI landing page builder',
      'no-code AI developer',
    ],
    bullets: [
      '7-phase swarm: clarify → plan → build → verify → deploy',
      'Landing pages, dashboards, games, and full-stack apps from chat',
      'Live preview cards and todo tracking during generation',
      'Export-ready code pushed to your GitHub repository',
    ],
    faq: [
      { q: 'Can Xroga build a full website?', a: 'Yes. Describe your project and the swarm generates HTML, React, or full-stack code with review passes.' },
      { q: 'Does it build mobile apps and games?', a: 'Yes. Xroga supports app, game, and software project types with specialized agent routing.' },
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
      { q: 'Is debugging included?', a: 'Yes. Debugging uses the same action balance as chat and build on all plans.' },
    ],
    relatedSlugs: ['build-websites-apps-games', 'github-auto-deploy', 'ai-chat'],
  },
  {
    slug: 'github-auto-deploy',
    title: 'GitHub Connect & Auto Deploy',
    headline: 'GitHub Integration — Connect, Push Code & Auto-Deploy',
    description:
      'Connect GitHub to Xroga AI — OAuth in one click, pick repo and branch, auto-push swarm builds, and manage project files. The AI site developers trust for GitHub-native workflows.',
    keywords: [
      'GitHub AI integration',
      'AI GitHub deploy',
      'connect GitHub AI',
      'Xroga GitHub',
      'auto push GitHub AI',
      'AI code to GitHub',
      'GitHub OAuth AI builder',
    ],
    bullets: [
      'GitHub OAuth before builds — activation success animation on connect',
      'Repo and branch selector above chat — real GitHub API lists',
      'Auto-create repos or use monorepo strategy',
      'Push after every swarm build with commit messages',
    ],
    faq: [
      { q: 'Does Xroga connect to GitHub?', a: 'Yes. Connect from the build gate or Integrations — OAuth to xroga.com callback.' },
      { q: 'Can I choose which repo and branch?', a: 'Yes. After connect, pick repo and branch from dropdowns above the chatbar.' },
    ],
    relatedSlugs: ['vercel-netlify-deploy', 'build-websites-apps-games', 'integrations'],
  },
  {
    slug: 'vercel-netlify-deploy',
    title: 'Vercel & Netlify Deploy',
    headline: 'Deploy to Vercel & Netlify — Live Preview in Seconds',
    description:
      'Xroga AI deploys your builds to Vercel with Netlify fallback — live preview URLs, static sites, and production-ready hosting after every GitHub push. No manual deploy steps.',
    keywords: [
      'AI Vercel deploy',
      'AI Netlify deploy',
      'Xroga deploy',
      'live preview AI',
      'deploy website AI',
      'Vercel AI builder',
      'automatic deploy AI',
    ],
    bullets: [
      'GitHub push → Vercel deploy → live preview URL in chat',
      'Netlify fallback if Vercel is unavailable',
      'Landing page iframe preview in dashboard',
      'Manage files and redeploy from one swarm session',
    ],
    faq: [
      { q: 'Does Xroga deploy to Vercel?', a: 'Yes. After GitHub push, Xroga triggers Vercel deployment and shows the live URL.' },
      { q: 'What if Vercel fails?', a: 'Xroga automatically falls back to Netlify deploy when configured.' },
    ],
    relatedSlugs: ['github-auto-deploy', 'build-websites-apps-games', 'integrations'],
  },
  {
    slug: 'integrations',
    title: '710+ Integrations',
    headline: '710+ Integrations — Connect Every Tool to Xroga AI',
    description:
      'Xroga AI connects to 710+ integrations — GitHub, Vercel, Netlify, Stripe, Slack, OpenAI, Google, AWS, and more. One AI swarm OS for your entire stack.',
    keywords: [
      'Xroga integrations',
      'AI integrations platform',
      '710 integrations AI',
      'connect tools AI',
      'GitHub Vercel Stripe AI',
      'AI automation integrations',
      'best AI integration hub',
    ],
    bullets: [
      '710+ integrations across 34 categories — dev, media, payments, CRM',
      'GitHub, Vercel, Netlify, Supabase, Stripe, and council AI keys',
      'Custom API keys and OAuth connections in dashboard',
      'Swarm routes tasks to the right connected service automatically',
    ],
    faq: [
      { q: 'How many integrations does Xroga have?', a: 'Over 710 integrations across development, media, payments, automation, and more.' },
      { q: 'Can I add my own API keys?', a: 'Yes. Use Custom API Keys in Integrations for any provider.' },
    ],
    relatedSlugs: ['github-auto-deploy', 'vercel-netlify-deploy', 'ai-chat'],
  },
  {
    slug: 'ai-video-generation',
    title: 'AI Video Generation',
    headline: 'AI Video Generation — Create Videos from Text & Images',
    description:
      'Generate AI videos, shorts, and reels with Xroga — multi-provider video swarm, progress tracking, background jobs, and share packs for TikTok and YouTube.',
    keywords: [
      'AI video generation',
      'text to video AI',
      'Xroga video AI',
      'AI video maker',
      'generate video with AI',
      'AI shorts generator',
    ],
    bullets: [
      'Text-to-video and image-to-video in the chatbar',
      'Multi-provider fallback for reliable generation',
      'Video studio with download and share packs',
      'Background jobs — get notified when video is ready',
    ],
    faq: [
      { q: 'Can Xroga generate videos?', a: 'Yes. Ask for a video in chat or use the media studio — Xroga routes to OSS and premium video models.' },
    ],
    relatedSlugs: ['ai-image-generation', 'ai-chat', 'integrations'],
  },
  {
    slug: 'browser-automation',
    title: 'Browser Automation',
    headline: 'AI Browser Automation — Scrape, Test & Automate the Web',
    description:
      'Xroga AI browser automation — scrape pages, fill forms, run tests, and automate workflows with AI-driven browser agents built into the swarm OS.',
    keywords: [
      'AI browser automation',
      'web scraping AI',
      'Xroga browser',
      'automate browser AI',
      'AI web agent',
    ],
    bullets: [
      'Built-in browser panel split with chat on dashboard',
      'AI-driven navigation, scraping, and form automation',
      'Part of the 98-feature stack on every plan',
    ],
    faq: [
      { q: 'Does Xroga have browser automation?', a: 'Yes. Open the browser panel on the dashboard and instruct the swarm to browse or scrape.' },
    ],
    relatedSlugs: ['ai-chat', 'integrations', 'build-websites-apps-games'],
  },
];

export function getAllFeatureSlugs(): string[] {
  return FEATURE_SEO_PAGES.map((p) => p.slug);
}

export function getFeatureBySlug(slug: string): FeatureSeoPage | undefined {
  return FEATURE_SEO_PAGES.find((p) => p.slug === slug);
}
