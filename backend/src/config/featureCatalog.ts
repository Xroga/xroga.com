/** Master catalog — 98 XROGA features mapped to agent + system prompt + category */

export type SwarmAgentName =
  | 'architect'
  | 'builder'
  | 'reviewer'
  | 'qa'
  | 'debugger'
  | 'automation';

export interface FeatureCatalogEntry {
  id: string;
  name: string;
  category: string;
  agent: SwarmAgentName;
  systemPrompt: string;
  promptTemplate: string;
  estimatedSeconds: number;
  actionCost: number;
  keywords: string[];
}

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  { id: 'chat', name: 'Chat / Text AI', category: 'Core', agent: 'builder', systemPrompt: 'You are Xroga. Answer thoroughly with examples.', promptTemplate: '', estimatedSeconds: 5, actionCost: 1, keywords: ['chat', 'ask', 'explain', 'help'] },
  { id: 'script_outline', name: 'Script Outline / Logline', category: 'Creative', agent: 'architect', systemPrompt: 'Generate a compelling logline and 3-act outline.', promptTemplate: 'Write a script outline and logline for: ', estimatedSeconds: 15, actionCost: 2, keywords: ['outline', 'logline', 'script outline'] },
  { id: 'code_generation', name: 'Code Generation', category: 'Build', agent: 'builder', systemPrompt: 'Generate complete, production-ready code with comments. Never truncate.', promptTemplate: 'Write production-ready code for: ', estimatedSeconds: 30, actionCost: 3, keywords: ['code', 'program', 'function', 'api', 'app'] },
  { id: 'image_generation', name: 'Image Generation', category: 'Media', agent: 'builder', systemPrompt: 'Generate image via Replicate/Luma with refined prompt.', promptTemplate: 'Generate an image of: ', estimatedSeconds: 45, actionCost: 4, keywords: ['image', 'picture', 'logo', 'art'] },
  { id: 'character_profile', name: 'Character Profile', category: 'Creative', agent: 'architect', systemPrompt: 'Generate a detailed character profile with backstory, traits, and arc.', promptTemplate: 'Create a character profile for: ', estimatedSeconds: 20, actionCost: 2, keywords: ['character', 'profile', 'backstory'] },
  { id: 'browser_automation', name: 'Browser Automation', category: 'Automation', agent: 'automation', systemPrompt: 'Convert to Playwright script and execute safely.', promptTemplate: 'Automate this browser task: ', estimatedSeconds: 60, actionCost: 5, keywords: ['browser', 'scrape', 'navigate', 'screenshot'] },
  { id: 'scene_script', name: 'Scene Script (2-3 pp)', category: 'Creative', agent: 'builder', systemPrompt: 'Write a 2-3 page scene with dialogue and stage directions.', promptTemplate: 'Write a 2-3 page scene about: ', estimatedSeconds: 25, actionCost: 3, keywords: ['scene', 'screenplay scene'] },
  { id: 'dialogue_polish', name: 'Dialogue Polish / Localization', category: 'Creative', agent: 'reviewer', systemPrompt: 'Polish dialogue for natural flow and localize if requested.', promptTemplate: 'Polish and localize this dialogue: ', estimatedSeconds: 20, actionCost: 2, keywords: ['dialogue', 'localize', 'polish'] },
  { id: 'voice_audio', name: 'Voice / Audio', category: 'Media', agent: 'builder', systemPrompt: 'Generate TTS script and voice direction using Cartesia/ElevenLabs chain.', promptTemplate: 'Create voice/audio for: ', estimatedSeconds: 40, actionCost: 4, keywords: ['voice', 'tts', 'audio', 'narration'] },
  { id: '3d_model', name: '3D Model Generation', category: 'Media', agent: 'builder', systemPrompt: 'Generate 3D model via Replicate/Luma with blueprint fallback.', promptTemplate: 'Generate a 3D model of: ', estimatedSeconds: 120, actionCost: 8, keywords: ['3d', 'model', 'mesh', 'blender'] },
  { id: 'script_analysis', name: 'Script Analysis & Coverage', category: 'Creative', agent: 'reviewer', systemPrompt: 'Provide script coverage: premise, structure, characters, marketability.', promptTemplate: 'Analyze this script: ', estimatedSeconds: 30, actionCost: 3, keywords: ['coverage', 'script analysis'] },
  { id: 'social_posting', name: 'Social Media Posting', category: 'Automation', agent: 'automation', systemPrompt: 'Post this content to Twitter/LinkedIn via API integrations.', promptTemplate: 'Post this to social media: ', estimatedSeconds: 15, actionCost: 1, keywords: ['post', 'twitter', 'linkedin', 'social'] },
  { id: 'transcription', name: 'Transcription (1-hour)', category: 'Media', agent: 'builder', systemPrompt: 'Transcribe audio with timestamps and speaker labels.', promptTemplate: 'Transcribe this audio: ', estimatedSeconds: 180, actionCost: 10, keywords: ['transcribe', 'transcription', 'subtitle'] },
  { id: 'storyboard', name: 'Storyboard (5 key frames)', category: 'Creative', agent: 'architect', systemPrompt: 'Create 5 key storyboard frames with shot descriptions.', promptTemplate: 'Storyboard 5 key frames for: ', estimatedSeconds: 45, actionCost: 5, keywords: ['storyboard', 'frames', 'shots'] },
  { id: 'full_episode', name: 'Full Episode (45 min)', category: 'Media', agent: 'builder', systemPrompt: 'Outline and script a full 45-minute episode with acts and beats.', promptTemplate: 'Write a full 45-minute episode about: ', estimatedSeconds: 300, actionCost: 50, keywords: ['episode', '45 min', 'full episode'] },
  { id: 'episode_summary', name: 'Episode Summarization', category: 'Creative', agent: 'reviewer', systemPrompt: 'Summarize episode with key plot points and character arcs.', promptTemplate: 'Summarize this episode: ', estimatedSeconds: 15, actionCost: 2, keywords: ['summarize episode', 'recap'] },
  { id: 'ai_video', name: 'AI Video Generation', category: 'Media', agent: 'builder', systemPrompt: 'Generate video via Runway/Kling/Hailuo with storyboard preview.', promptTemplate: 'Generate a video about: ', estimatedSeconds: 180, actionCost: 50, keywords: ['video', 'movie', 'clip', 'trailer'] },
  { id: 'swarm_multi_agent', name: 'Multi-agent Swarm', category: 'Core', agent: 'architect', systemPrompt: 'Orchestrate full Architect→Builder→Reviewer→QA pipeline.', promptTemplate: '', estimatedSeconds: 60, actionCost: 5, keywords: ['swarm', 'multi agent'] },
  { id: 'browser_scrape', name: 'Browser automation & scrape', category: 'Automation', agent: 'automation', systemPrompt: 'Scrape and extract structured data safely.', promptTemplate: 'Scrape data from: ', estimatedSeconds: 45, actionCost: 5, keywords: ['scrape', 'extract', 'crawl'] },
  { id: 'safe_browser', name: 'Xroga Safe Browser', category: 'Safety', agent: 'qa', systemPrompt: 'Enable safe browsing with blocklist and SafeSearch.', promptTemplate: 'Enable safe browser protection', estimatedSeconds: 5, actionCost: 1, keywords: ['safe browser', 'block adult'] },
  { id: 'integrations_catalog', name: '710+ integrations catalog', category: 'Platform', agent: 'architect', systemPrompt: 'Recommend integrations from catalog for user goal.', promptTemplate: 'Which integrations do I need for: ', estimatedSeconds: 10, actionCost: 1, keywords: ['integration', 'connect', 'api'] },
  { id: 'github_deploy', name: 'GitHub connect & deploy', category: 'Deploy', agent: 'automation', systemPrompt: 'Connect GitHub repo and trigger deploy pipeline.', promptTemplate: 'Deploy my project via GitHub: ', estimatedSeconds: 90, actionCost: 5, keywords: ['github', 'deploy', 'push'] },
  { id: 'billing_actions', name: 'Honest action-based billing', category: 'Platform', agent: 'architect', systemPrompt: 'Explain action costs transparently.', promptTemplate: 'How many actions will this cost: ', estimatedSeconds: 5, actionCost: 0, keywords: ['actions', 'billing', 'cost'] },
  { id: 'action_calculator', name: 'Reverse action calculator', category: 'Platform', agent: 'architect', systemPrompt: 'Estimate actions and time without executing.', promptTemplate: '', estimatedSeconds: 3, actionCost: 0, keywords: ['estimate', 'calculator'] },
  { id: 'terminal_fullscreen', name: 'Terminal fullscreen mode', category: 'UI', agent: 'architect', systemPrompt: 'UI feature — fullscreen terminal.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['fullscreen', 'terminal'] },
  { id: 'split_terminal', name: 'Split terminal + browser view', category: 'UI', agent: 'architect', systemPrompt: 'UI feature — split terminal and live preview.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['split', 'browser view'] },
  { id: 'theme_image', name: 'Theme: Image / White / Black / Gray', category: 'UI', agent: 'architect', systemPrompt: 'UI theme switching.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['theme'] },
  { id: 'terminal_skin', name: 'Terminal skin cycling', category: 'UI', agent: 'architect', systemPrompt: 'Cycle terminal skins.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['skin', 'terminal color'] },
  { id: 'voice_input', name: 'Voice input (mic)', category: 'UI', agent: 'builder', systemPrompt: 'Process voice input transcription.', promptTemplate: '', estimatedSeconds: 5, actionCost: 1, keywords: ['voice input', 'mic'] },
  { id: 'file_upload', name: 'File upload (any format)', category: 'Platform', agent: 'builder', systemPrompt: 'Analyze uploaded file content.', promptTemplate: 'Analyze my uploaded file: ', estimatedSeconds: 15, actionCost: 2, keywords: ['upload', 'file', 'attachment'] },
  { id: 'drag_drop', name: 'Drag & drop attachments', category: 'Platform', agent: 'builder', systemPrompt: 'Process drag-drop attachments.', promptTemplate: '', estimatedSeconds: 5, actionCost: 1, keywords: ['drag', 'drop'] },
  { id: 'project_files', name: 'Project file manager', category: 'Platform', agent: 'architect', systemPrompt: 'Organize project files and structure.', promptTemplate: 'Organize project files for: ', estimatedSeconds: 20, actionCost: 2, keywords: ['project files', 'file manager'] },
  { id: 'swarm_history', name: 'Swarm run history', category: 'Platform', agent: 'architect', systemPrompt: 'Show swarm run history.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['history', 'runs'] },
  { id: 'automation_hub', name: 'Automation hub', category: 'Automation', agent: 'automation', systemPrompt: 'Manage automation workflows.', promptTemplate: 'Set up automation for: ', estimatedSeconds: 30, actionCost: 3, keywords: ['automation hub', 'workflow'] },
  { id: 'build_history', name: 'Build history', category: 'Platform', agent: 'architect', systemPrompt: 'Show build history.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['build history'] },
  { id: 'action_analytics', name: 'Action spend analytics', category: 'Platform', agent: 'architect', systemPrompt: 'Analyze action spend patterns.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['analytics', 'spend'] },
  { id: 'custom_domain', name: 'Custom domain deploy', category: 'Deploy', agent: 'automation', systemPrompt: 'Configure custom domain on Vercel/Fly.', promptTemplate: 'Deploy with custom domain: ', estimatedSeconds: 60, actionCost: 5, keywords: ['custom domain', 'dns'] },
  { id: 'vercel_deploy', name: 'Vercel deploy hook', category: 'Deploy', agent: 'automation', systemPrompt: 'Trigger Vercel deploy hook with fallbacks.', promptTemplate: 'Deploy to Vercel: ', estimatedSeconds: 90, actionCost: 5, keywords: ['vercel', 'deploy hook'] },
  { id: 'website_gen', name: 'Website generation', category: 'Build', agent: 'builder', systemPrompt: 'Generate full website HTML/CSS/JS and deploy.', promptTemplate: 'Build a website for: ', estimatedSeconds: 60, actionCost: 25, keywords: ['website', 'landing page', 'site'] },
  { id: 'mobile_scaffold', name: 'Mobile app scaffolding', category: 'Build', agent: 'builder', systemPrompt: 'Scaffold React Native/Flutter mobile app.', promptTemplate: 'Scaffold a mobile app for: ', estimatedSeconds: 90, actionCost: 15, keywords: ['mobile app', 'ios', 'android'] },
  { id: 'game_build', name: '3D/2D game builds', category: 'Build', agent: 'builder', systemPrompt: 'Build 2D/3D game prototype with Unity/Godot patterns.', promptTemplate: 'Build a game: ', estimatedSeconds: 120, actionCost: 20, keywords: ['game', 'unity', 'godot', '2d', '3d game'] },
  { id: 'movie_script', name: 'Movie & drama scripts', category: 'Creative', agent: 'builder', systemPrompt: 'Write cinematic movie or drama script with acts.', promptTemplate: 'Write a movie script about: ', estimatedSeconds: 60, actionCost: 8, keywords: ['movie', 'drama', 'screenplay'] },
  { id: 'web_research', name: 'Web search & research', category: 'Research', agent: 'builder', systemPrompt: 'Deep research via Tavily/Exa with citations.', promptTemplate: 'Research: ', estimatedSeconds: 90, actionCost: 100, keywords: ['research', 'search', 'find'] },
  { id: 'code_debug', name: 'Code debug & fix', category: 'Build', agent: 'debugger', systemPrompt: 'Debug code until zero defects.', promptTemplate: 'Debug and fix: ', estimatedSeconds: 45, actionCost: 15, keywords: ['debug', 'fix', 'bug', 'error'] },
  { id: 'voice_clone', name: 'Voice TTS & cloning', category: 'Media', agent: 'builder', systemPrompt: 'Clone voice or generate TTS with ElevenLabs/Cartesia.', promptTemplate: 'Clone voice for: ', estimatedSeconds: 60, actionCost: 6, keywords: ['clone', 'tts', 'elevenlabs'] },
  { id: 'game_templates', name: 'Android/iOS game templates', category: 'Build', agent: 'builder', systemPrompt: 'Generate mobile game template project.', promptTemplate: 'Create mobile game template for: ', estimatedSeconds: 90, actionCost: 15, keywords: ['game template', 'mobile game'] },
  { id: 'api_vault', name: 'API key vault', category: 'Platform', agent: 'automation', systemPrompt: 'Store encrypted API keys securely.', promptTemplate: 'Store API key for: ', estimatedSeconds: 10, actionCost: 5, keywords: ['api key', 'vault', 'credentials'] },
  { id: 'webhooks', name: 'Custom webhooks', category: 'Automation', agent: 'automation', systemPrompt: 'Configure custom webhook endpoints.', promptTemplate: 'Set up webhook for: ', estimatedSeconds: 20, actionCost: 3, keywords: ['webhook'] },
  { id: 'slack_ui', name: 'Slack integration (UI)', category: 'Integrations', agent: 'automation', systemPrompt: 'Connect Slack workspace.', promptTemplate: 'Connect Slack for: ', estimatedSeconds: 15, actionCost: 2, keywords: ['slack'] },
  { id: 'discord_ui', name: 'Discord integration (UI)', category: 'Integrations', agent: 'automation', systemPrompt: 'Connect Discord server.', promptTemplate: 'Connect Discord for: ', estimatedSeconds: 15, actionCost: 2, keywords: ['discord'] },
  { id: 'notion_ui', name: 'Notion integration (UI)', category: 'Integrations', agent: 'automation', systemPrompt: 'Sync with Notion workspace.', promptTemplate: 'Sync with Notion: ', estimatedSeconds: 15, actionCost: 2, keywords: ['notion'] },
  { id: 'stripe_billing', name: 'Stripe billing', category: 'Billing', agent: 'architect', systemPrompt: 'Configure Stripe billing.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['stripe'] },
  { id: 'paypal_billing', name: 'PayPal billing', category: 'Billing', agent: 'architect', systemPrompt: 'Configure PayPal billing.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['paypal'] },
  { id: 'top_up', name: 'Top-up actions', category: 'Billing', agent: 'architect', systemPrompt: 'Guide user to top up actions.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['top up', 'topup'] },
  { id: 'free_trial', name: 'Free trial 50 actions', category: 'Billing', agent: 'architect', systemPrompt: 'Explain free trial.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['trial', 'free'] },
  { id: 'concurrency', name: 'Concurrency limits per plan', category: 'Billing', agent: 'architect', systemPrompt: 'Explain concurrency limits.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['concurrency', 'parallel'] },
  { id: 'sse_stream', name: 'Real-time SSE swarm stream', category: 'Core', agent: 'architect', systemPrompt: 'Stream swarm progress via SSE.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['stream', 'sse'] },
  { id: 'truth_council', name: 'Truth Council verification', category: 'Core', agent: 'reviewer', systemPrompt: 'Verify facts and safety via Truth Council.', promptTemplate: '', estimatedSeconds: 15, actionCost: 2, keywords: ['verify', 'truth', 'fact check'] },
  { id: 'out_of_actions', name: 'Out-of-actions modal', category: 'Billing', agent: 'architect', systemPrompt: 'Show upgrade path when out of actions.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['out of actions'] },
  { id: 'notifications', name: 'Notification bell', category: 'UI', agent: 'architect', systemPrompt: 'UI notifications.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['notification'] },
  { id: 'profile_avatar', name: 'Profile & avatar upload', category: 'UI', agent: 'builder', systemPrompt: 'Generate or upload avatar.', promptTemplate: 'Generate avatar for: ', estimatedSeconds: 20, actionCost: 2, keywords: ['avatar', 'profile'] },
  { id: 'settings', name: 'Settings & preferences', category: 'UI', agent: 'architect', systemPrompt: 'Help with settings.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['settings', 'preferences'] },
  { id: 'sidebar_search', name: 'Sidebar search', category: 'UI', agent: 'architect', systemPrompt: 'Search sidebar features.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['sidebar search'] },
  { id: 'media_gallery', name: 'Media gallery', category: 'UI', agent: 'architect', systemPrompt: 'Browse media gallery.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['gallery', 'media'] },
  { id: 'quick_actions', name: 'Quick action tabs', category: 'UI', agent: 'architect', systemPrompt: 'Quick action shortcuts.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['quick action'] },
  { id: 'homepage_carry', name: 'Homepage prompt carry-over', category: 'UI', agent: 'architect', systemPrompt: 'Carry homepage prompt to dashboard.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['homepage'] },
  { id: 'magic_link', name: 'Magic link auth', category: 'Auth', agent: 'architect', systemPrompt: 'Auth via magic link.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['magic link'] },
  { id: 'google_oauth', name: 'Google OAuth', category: 'Auth', agent: 'architect', systemPrompt: 'Google OAuth sign-in.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['google', 'oauth'] },
  { id: 'github_oauth', name: 'GitHub OAuth', category: 'Auth', agent: 'architect', systemPrompt: 'GitHub OAuth sign-in.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['github oauth'] },
  { id: 'email_auth', name: 'Email/password auth', category: 'Auth', agent: 'architect', systemPrompt: 'Email/password authentication.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['email', 'password', 'sign in'] },
  { id: 'safe_search', name: 'Privacy-first safe search', category: 'Safety', agent: 'qa', systemPrompt: 'Enforce safe search.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['safe search', 'privacy'] },
  { id: 'vpn_detect', name: 'VPN/proxy detection', category: 'Safety', agent: 'qa', systemPrompt: 'Detect VPN/proxy usage.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['vpn', 'proxy'] },
  { id: 'url_blocklist', name: 'URL category blocklist', category: 'Safety', agent: 'qa', systemPrompt: 'Block unsafe URL categories.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['blocklist', 'block url'] },
  { id: 'forced_safesearch', name: 'Forced SafeSearch on queries', category: 'Safety', agent: 'qa', systemPrompt: 'Force SafeSearch on all queries.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['safesearch'] },
  { id: 'tab_isolation', name: 'Tab isolation (browser)', category: 'Safety', agent: 'qa', systemPrompt: 'Isolate browser tabs.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['tab isolation'] },
  { id: 'download_scan', name: 'Download scan (browser)', category: 'Safety', agent: 'qa', systemPrompt: 'Scan downloads for safety.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['download scan'] },
  { id: 'typewriter', name: 'Swarm message typewriter', category: 'UI', agent: 'architect', systemPrompt: 'Typewriter effect for responses.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['typewriter'] },
  { id: 'ai_branding', name: 'AI response branding', category: 'UI', agent: 'architect', systemPrompt: 'Branded AI responses.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['branding'] },
  { id: 'compact_analytics', name: 'Compact analytics', category: 'Platform', agent: 'architect', systemPrompt: 'Show compact analytics.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['analytics'] },
  { id: 'integration_search', name: 'Integration search', category: 'Integrations', agent: 'architect', systemPrompt: 'Search integration catalog.', promptTemplate: 'Find integration for: ', estimatedSeconds: 5, actionCost: 0, keywords: ['integration search'] },
  { id: 'credentials_store', name: 'Custom credentials store', category: 'Platform', agent: 'automation', systemPrompt: 'Store custom credentials encrypted.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['credentials', 'vault'] },
  { id: 'plan_upgrade', name: 'Plan upgrade flow', category: 'Billing', agent: 'architect', systemPrompt: 'Guide plan upgrade.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['upgrade', 'plan'] },
  { id: 'galactic_pricing', name: 'Galactic pricing tiers', category: 'Billing', agent: 'architect', systemPrompt: 'Explain galactic pricing tiers.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['pricing', 'galactic'] },
  { id: 'about_ceo', name: 'About & CEO page', category: 'UI', agent: 'architect', systemPrompt: 'About Xroga and CEO info.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['about', 'ceo'] },
  { id: 'seo_sitemap', name: 'SEO sitemap & robots', category: 'Deploy', agent: 'automation', systemPrompt: 'Generate sitemap and robots.txt.', promptTemplate: 'Generate SEO sitemap for: ', estimatedSeconds: 15, actionCost: 2, keywords: ['sitemap', 'robots', 'seo'] },
  { id: 'opengraph', name: 'OpenGraph meta tags', category: 'Deploy', agent: 'builder', systemPrompt: 'Generate OpenGraph meta tags.', promptTemplate: 'Generate OpenGraph tags for: ', estimatedSeconds: 10, actionCost: 1, keywords: ['opengraph', 'og tags', 'meta'] },
  { id: 'mobile_responsive', name: 'Mobile responsive shell', category: 'UI', agent: 'architect', systemPrompt: 'Mobile responsive layout.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['mobile', 'responsive'] },
  { id: 'landing_page', name: 'Landing Page Builder', category: 'Build', agent: 'builder', systemPrompt: 'Build and deploy landing page to Vercel.', promptTemplate: 'Build a landing page for: ', estimatedSeconds: 60, actionCost: 25, keywords: ['landing'] },
  { id: 'deep_research', name: 'Deep Research Report', category: 'Research', agent: 'builder', systemPrompt: 'Conduct deep research with PDF report.', promptTemplate: 'Deep research report on: ', estimatedSeconds: 120, actionCost: 100, keywords: ['deep research', 'report', 'phd'] },
  { id: 'job_hunter', name: 'Job Hunter Auto-Apply', category: 'Automation', agent: 'automation', systemPrompt: 'Scrape jobs and auto-apply with tailored resume.', promptTemplate: 'Find and apply to jobs for: ', estimatedSeconds: 180, actionCost: 90, keywords: ['job', 'career', 'apply', 'upwork'] },
  { id: 'content_blocker', name: 'Content Blocker', category: 'Safety', agent: 'qa', systemPrompt: 'Enable content protection and DNS filtering.', promptTemplate: 'Enable content blocker', estimatedSeconds: 5, actionCost: 1, keywords: ['blocker', 'nsfw', 'adult'] },
  { id: 'key_creation', name: 'API Key Creation', category: 'Integrations', agent: 'automation', systemPrompt: 'Auto-create and store API keys.', promptTemplate: 'Create API key for: ', estimatedSeconds: 30, actionCost: 5, keywords: ['api key', 'connect openai'] },
  { id: 'cross_post', name: 'Cross-Platform Posting', category: 'Automation', agent: 'automation', systemPrompt: 'Cross-post to multiple social platforms.', promptTemplate: 'Cross-post to social: ', estimatedSeconds: 15, actionCost: 1, keywords: ['cross post', 'share'] },
  { id: 'video_studio', name: 'Video Studio', category: 'Media', agent: 'builder', systemPrompt: 'Full video studio pipeline with screenplay and render.', promptTemplate: 'Create video in studio: ', estimatedSeconds: 180, actionCost: 50, keywords: ['video studio', 'omni video'] },
  { id: 'deploy_fly', name: 'Fly.io Deploy', category: 'Deploy', agent: 'automation', systemPrompt: 'Deploy backend to Fly.io with GitHub→flyctl fallbacks.', promptTemplate: 'Deploy to Fly.io: ', estimatedSeconds: 120, actionCost: 5, keywords: ['fly.io', 'fly deploy'] },
  { id: 'deploy_vercel', name: 'Vercel Deploy', category: 'Deploy', agent: 'automation', systemPrompt: 'Deploy frontend to Vercel with hook→API→CLI fallbacks.', promptTemplate: 'Deploy to Vercel: ', estimatedSeconds: 90, actionCost: 5, keywords: ['vercel deploy'] },
  { id: 'reasoning_trace', name: 'Reasoning Transparency', category: 'Core', agent: 'architect', systemPrompt: 'Show DAG and reasoning trace.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['reasoning', 'show plan'] },
  { id: 'follow_ups', name: 'Quick Follow-ups', category: 'Core', agent: 'reviewer', systemPrompt: 'Generate 3 context-aware follow-up questions.', promptTemplate: '', estimatedSeconds: 5, actionCost: 0, keywords: ['follow up', 'suggestion'] },
  { id: 'processing_pipeline', name: 'Processing Pipeline UI', category: 'UI', agent: 'architect', systemPrompt: 'Animated processing pipeline display.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['pipeline', 'processing'] },
  { id: 'admin_logs', name: 'Admin Error Logs', category: 'Platform', agent: 'architect', systemPrompt: 'Admin dashboard for system errors.', promptTemplate: '', estimatedSeconds: 0, actionCost: 0, keywords: ['admin', 'logs'] },
  { id: 'shell_terminal', name: 'Shell Terminal', category: 'Automation', agent: 'automation', systemPrompt: 'Run shell commands via Automation Runtime.', promptTemplate: 'Run terminal command: ', estimatedSeconds: 30, actionCost: 3, keywords: ['terminal', 'shell', 'command'] },
  { id: 'black_hole', name: 'Black Hole V∞ Swarm', category: 'Core', agent: 'architect', systemPrompt: 'Full Black Hole V∞ orchestration with zero-failure policy.', promptTemplate: '', estimatedSeconds: 60, actionCost: 5, keywords: ['black hole', 'xroga swarm'] },
];

// Pad to exactly 98 entries if needed
while (FEATURE_CATALOG.length < 98) {
  const n = FEATURE_CATALOG.length + 1;
  FEATURE_CATALOG.push({
    id: `feature_${n}`,
    name: `XROGA Feature ${n}`,
    category: 'Platform',
    agent: 'architect',
    systemPrompt: 'Handle user request with full swarm pipeline.',
    promptTemplate: '',
    estimatedSeconds: 5,
    actionCost: 1,
    keywords: [`feature${n}`],
  });
}

export function matchFeatureByKeywords(prompt: string): FeatureCatalogEntry | null {
  const lower = prompt.toLowerCase();
  let best: FeatureCatalogEntry | null = null;
  let bestScore = 0;
  for (const f of FEATURE_CATALOG) {
    let score = 0;
    for (const kw of f.keywords) {
      if (lower.includes(kw.toLowerCase())) score += kw.length;
    }
    if (f.name.toLowerCase().split(' ').some((w) => w.length > 3 && lower.includes(w))) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return bestScore >= 3 ? best : null;
}

export function getFeatureById(id: string): FeatureCatalogEntry | undefined {
  return FEATURE_CATALOG.find((f) => f.id === id);
}

export const FEATURE_CATEGORIES = [...new Set(FEATURE_CATALOG.map((f) => f.category))].sort();
