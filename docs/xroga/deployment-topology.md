# Deployment topology — read-only truth

Source SHA: `cb27adefb8a8ffec7136aedc8207f82260e0646e`; source/config hashes are recorded in the JSON. This is source discovery plus explicitly dated read-only observations, not a new deployment or certification of all integrations.

| Dependency | Provider | State | Host/resource | Verification |
| --- | --- | --- | --- | --- |
| frontend | Vercel | ACTIVE | xroga.com, www.xroga.com | Observed evidence explicitly scoped below; not full journey certification |
| api | Fly.io | ACTIVE | xroga-api.fly.dev | Observed evidence explicitly scoped below; not full journey certification |
| supabase | Supabase | ACTIVE | nzenxdfumxrnsmybazmo.supabase.co | Observed evidence explicitly scoped below; not full journey certification |
| supabase-legacy | Supabase | LEGACY | lztqfktsahpzitybthld.supabase.co | Observed evidence explicitly scoped below; not full journey certification |
| redis | Redis / BullMQ | CONFIGURED_BUT_UNVERIFIED | Unknown/not applicable | NOT_INDEPENDENTLY_VERIFIED |
| r2 | Cloudflare R2 (S3-compatible) | CONFIGURED_BUT_UNVERIFIED | *.r2.cloudflarestorage.com, api.cloudflare.com | NOT_INDEPENDENTLY_VERIFIED |
| local-media | Retained legacy API filesystem cache | LEGACY | Unknown/not applicable | NOT_INDEPENDENTLY_VERIFIED |
| fly-sandbox | Fly Machines / existing remote worker adapters | CONFIGURED_BUT_UNVERIFIED | api.machines.dev | Observed evidence explicitly scoped below; not full journey certification |
| credential-store | Existing Supabase-backed vault / private storage mirror | CONFIGURED_BUT_UNVERIFIED | Unknown/not applicable | NOT_INDEPENDENTLY_VERIFIED |
| browserbase | Browserbase | CONFIGURED_BUT_UNVERIFIED | www.browserbase.com | NOT_INDEPENDENTLY_VERIFIED |
| cloud-run-proposal | Google Cloud Run / Jobs | PROPOSED | Unknown/not applicable | NOT_INDEPENDENTLY_VERIFIED |
| cloudflare-workers-proposal | Cloudflare Workers | PROPOSED | Unknown/not applicable | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-127-0-0-1 | Source-defined endpoint 127.0.0.1 | LOCAL_ONLY | 127.0.0.1 | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-about-meta-com | Source-defined endpoint about.meta.com | CONFIGURED_BUT_UNVERIFIED | about.meta.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-accounts-google-com | Source-defined endpoint accounts.google.com | CONFIGURED_BUT_UNVERIFIED | accounts.google.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-ads-google-com | Source-defined endpoint ads.google.com | CONFIGURED_BUT_UNVERIFIED | ads.google.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-airtable-com | Source-defined endpoint airtable.com | CONFIGURED_BUT_UNVERIFIED | airtable.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-aistudio-google-com | Source-defined endpoint aistudio.google.com | CONFIGURED_BUT_UNVERIFIED | aistudio.google.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-analytics-ahrefs-com | Source-defined endpoint analytics.ahrefs.com | CONFIGURED_BUT_UNVERIFIED | analytics.ahrefs.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-m-paypal-com | Source-defined endpoint api-m.paypal.com | CONFIGURED_BUT_UNVERIFIED | api-m.paypal.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-m-sandbox-paypal-com | Source-defined endpoint api-m.sandbox.paypal.com | CONFIGURED_BUT_UNVERIFIED | api-m.sandbox.paypal.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-apify-com | Source-defined endpoint api.apify.com | CONFIGURED_BUT_UNVERIFIED | api.apify.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-cartesia-ai | Source-defined endpoint api.cartesia.ai | CONFIGURED_BUT_UNVERIFIED | api.cartesia.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-dev-runwayml-com | Source-defined endpoint api.dev.runwayml.com | CONFIGURED_BUT_UNVERIFIED | api.dev.runwayml.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-dicebear-com | Source-defined endpoint api.dicebear.com | CONFIGURED_BUT_UNVERIFIED | api.dicebear.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-elevenlabs-io | Source-defined endpoint api.elevenlabs.io | CONFIGURED_BUT_UNVERIFIED | api.elevenlabs.io | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-exa-ai | Source-defined endpoint api.exa.ai | CONFIGURED_BUT_UNVERIFIED | api.exa.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-expo-dev | Source-defined endpoint api.expo.dev | CONFIGURED_BUT_UNVERIFIED | api.expo.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-fish-audio | Source-defined endpoint api.fish.audio | CONFIGURED_BUT_UNVERIFIED | api.fish.audio | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-github-com | Source-defined endpoint api.github.com | CONFIGURED_BUT_UNVERIFIED | api.github.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-groq-com | Source-defined endpoint api.groq.com | CONFIGURED_BUT_UNVERIFIED | api.groq.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-lemonsqueezy-com | Source-defined endpoint api.lemonsqueezy.com | CONFIGURED_BUT_UNVERIFIED | api.lemonsqueezy.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-lumalabs-ai | Source-defined endpoint api.lumalabs.ai | CONFIGURED_BUT_UNVERIFIED | api.lumalabs.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-minimax-io | Source-defined endpoint api.minimax.io | CONFIGURED_BUT_UNVERIFIED | api.minimax.io | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-moonshot-ai | Source-defined endpoint api.moonshot.ai | CONFIGURED_BUT_UNVERIFIED | api.moonshot.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-netlify-com | Source-defined endpoint api.netlify.com | CONFIGURED_BUT_UNVERIFIED | api.netlify.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-openai-com | Source-defined endpoint api.openai.com | CONFIGURED_BUT_UNVERIFIED | api.openai.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-parallel-ai | Source-defined endpoint api.parallel.ai | CONFIGURED_BUT_UNVERIFIED | api.parallel.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-stripe-com | Source-defined endpoint api.stripe.com | CONFIGURED_BUT_UNVERIFIED | api.stripe.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-suno-ai | Source-defined endpoint api.suno.ai | CONFIGURED_BUT_UNVERIFIED | api.suno.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-supabase-com | Source-defined endpoint api.supabase.com | CONFIGURED_BUT_UNVERIFIED | api.supabase.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-vercel-com | Source-defined endpoint api.vercel.com | CONFIGURED_BUT_UNVERIFIED | api.vercel.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-whop-com | Source-defined endpoint api.whop.com | CONFIGURED_BUT_UNVERIFIED | api.whop.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-api-x-ai | Source-defined endpoint api.x.ai | CONFIGURED_BUT_UNVERIFIED | api.x.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-appstoreconnect-apple-com | Source-defined endpoint appstoreconnect.apple.com | CONFIGURED_BUT_UNVERIFIED | appstoreconnect.apple.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-aptos-dev | Source-defined endpoint aptos.dev | CONFIGURED_BUT_UNVERIFIED | aptos.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-asana-com | Source-defined endpoint asana.com | CONFIGURED_BUT_UNVERIFIED | asana.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-backend-composio-dev | Source-defined endpoint backend.composio.dev | CONFIGURED_BUT_UNVERIFIED | backend.composio.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-bolt-new | Source-defined endpoint bolt.new | CONFIGURED_BUT_UNVERIFIED | bolt.new | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-brandland-zendesk-com | Source-defined endpoint brandland.zendesk.com | CONFIGURED_BUT_UNVERIFIED | brandland.zendesk.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-build-avax-network | Source-defined endpoint build.avax.network | CONFIGURED_BUT_UNVERIFIED | build.avax.network | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-calendly-com | Source-defined endpoint calendly.com | CONFIGURED_BUT_UNVERIFIED | calendly.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-cdn-jsdelivr-net | Source-defined endpoint cdn.jsdelivr.net | CONFIGURED_BUT_UNVERIFIED | cdn.jsdelivr.net | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-cdn-simpleicons-org | Source-defined endpoint cdn.simpleicons.org | CONFIGURED_BUT_UNVERIFIED | cdn.simpleicons.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-chain-link | Source-defined endpoint chain.link | CONFIGURED_BUT_UNVERIFIED | chain.link | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-cheatsheetseries-owasp-org | Source-defined endpoint cheatsheetseries.owasp.org | CONFIGURED_BUT_UNVERIFIED | cheatsheetseries.owasp.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-chrome-google-com | Source-defined endpoint chrome.google.com | CONFIGURED_BUT_UNVERIFIED | chrome.google.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-chromewebstore-googleapis-com | Source-defined endpoint chromewebstore.googleapis.com | CONFIGURED_BUT_UNVERIFIED | chromewebstore.googleapis.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-design-intuit-com | Source-defined endpoint design.intuit.com | CONFIGURED_BUT_UNVERIFIED | design.intuit.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-dev-whop-com | Source-defined endpoint dev.whop.com | CONFIGURED_BUT_UNVERIFIED | dev.whop.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-developer-apple-com | Source-defined endpoint developer.apple.com | CONFIGURED_BUT_UNVERIFIED | developer.apple.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-developer-godaddy-com | Source-defined endpoint developer.godaddy.com | CONFIGURED_BUT_UNVERIFIED | developer.godaddy.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-developers-brevo-com | Source-defined endpoint developers.brevo.com | CONFIGURED_BUT_UNVERIFIED | developers.brevo.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-developers-cloudflare-com | Source-defined endpoint developers.cloudflare.com | CONFIGURED_BUT_UNVERIFIED | developers.cloudflare.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-developers-google-com | Source-defined endpoint developers.google.com | CONFIGURED_BUT_UNVERIFIED | developers.google.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-developers-stellar-org | Source-defined endpoint developers.stellar.org | CONFIGURED_BUT_UNVERIFIED | developers.stellar.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-devpost-com | Source-defined endpoint devpost.com | CONFIGURED_BUT_UNVERIFIED | devpost.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-anthropic-com | Source-defined endpoint docs.anthropic.com | CONFIGURED_BUT_UNVERIFIED | docs.anthropic.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-aws-amazon-com | Source-defined endpoint docs.aws.amazon.com | CONFIGURED_BUT_UNVERIFIED | docs.aws.amazon.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-base44-com | Source-defined endpoint docs.base44.com | CONFIGURED_BUT_UNVERIFIED | docs.base44.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-cursor-com | Source-defined endpoint docs.cursor.com | CONFIGURED_BUT_UNVERIFIED | docs.cursor.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-github-com | Source-defined endpoint docs.github.com | CONFIGURED_BUT_UNVERIFIED | docs.github.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-lovable-dev | Source-defined endpoint docs.lovable.dev | CONFIGURED_BUT_UNVERIFIED | docs.lovable.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-python-org | Source-defined endpoint docs.python.org | CONFIGURED_BUT_UNVERIFIED | docs.python.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-replit-com | Source-defined endpoint docs.replit.com | CONFIGURED_BUT_UNVERIFIED | docs.replit.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-sui-io | Source-defined endpoint docs.sui.io | CONFIGURED_BUT_UNVERIFIED | docs.sui.io | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-docs-windsurf-com | Source-defined endpoint docs.windsurf.com | CONFIGURED_BUT_UNVERIFIED | docs.windsurf.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-dorahacks-io | Source-defined endpoint dorahacks.io | CONFIGURED_BUT_UNVERIFIED | dorahacks.io | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-duckduckgo-com | Source-defined endpoint duckduckgo.com | CONFIGURED_BUT_UNVERIFIED | duckduckgo.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-ethglobal-com | Source-defined endpoint ethglobal.com | CONFIGURED_BUT_UNVERIFIED | ethglobal.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-example-invalid | Source-defined endpoint example.invalid | CONFIGURED_BUT_UNVERIFIED | example.invalid | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-exp-host | Source-defined endpoint exp.host | CONFIGURED_BUT_UNVERIFIED | exp.host | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-expo-dev | Source-defined endpoint expo.dev | CONFIGURED_BUT_UNVERIFIED | expo.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-fixture-invalid | Source-defined endpoint fixture.invalid | CONFIGURED_BUT_UNVERIFIED | fixture.invalid | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-fixture-supabase-co | Source-defined endpoint fixture.supabase.co | CONFIGURED_BUT_UNVERIFIED | fixture.supabase.co | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-fonts-gstatic-com | Source-defined endpoint fonts.gstatic.com | CONFIGURED_BUT_UNVERIFIED | fonts.gstatic.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-freetheai-xyz | Source-defined endpoint freetheai.xyz | CONFIGURED_BUT_UNVERIFIED | freetheai.xyz | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-gemini-google-com | Source-defined endpoint gemini.google.com | CONFIGURED_BUT_UNVERIFIED | gemini.google.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-generativelanguage-googleapis-com | Source-defined endpoint generativelanguage.googleapis.com | CONFIGURED_BUT_UNVERIFIED | generativelanguage.googleapis.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-getfoundry-sh | Source-defined endpoint getfoundry.sh | CONFIGURED_BUT_UNVERIFIED | getfoundry.sh | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-github-com | Source-defined endpoint github.com | CONFIGURED_BUT_UNVERIFIED | github.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-hardhat-org | Source-defined endpoint hardhat.org | CONFIGURED_BUT_UNVERIFIED | hardhat.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-huggingface-co | Source-defined endpoint huggingface.co | CONFIGURED_BUT_UNVERIFIED | huggingface.co | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-i-postimg-cc | Source-defined endpoint i.postimg.cc | CONFIGURED_BUT_UNVERIFIED | i.postimg.cc | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-islamic-relief-org | Source-defined endpoint islamic-relief.org | CONFIGURED_BUT_UNVERIFIED | islamic-relief.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-jobs-example-com | Source-defined endpoint jobs.example.com | CONFIGURED_BUT_UNVERIFIED | jobs.example.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-linear-app | Source-defined endpoint linear.app | CONFIGURED_BUT_UNVERIFIED | linear.app | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-localai-io | Source-defined endpoint localai.io | CONFIGURED_BUT_UNVERIFIED | localai.io | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-localhost | Source-defined endpoint localhost | LOCAL_ONLY | localhost | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-logos-composio-dev | Source-defined endpoint logos.composio.dev | CONFIGURED_BUT_UNVERIFIED | logos.composio.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-lovable-dev | Source-defined endpoint lovable.dev | CONFIGURED_BUT_UNVERIFIED | lovable.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-mailchimp-com | Source-defined endpoint mailchimp.com | CONFIGURED_BUT_UNVERIFIED | mailchimp.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-mcp-example-com | Source-defined endpoint mcp.example.com | CONFIGURED_BUT_UNVERIFIED | mcp.example.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-mixpanel-com | Source-defined endpoint mixpanel.com | CONFIGURED_BUT_UNVERIFIED | mixpanel.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-neon-com | Source-defined endpoint neon.com | CONFIGURED_BUT_UNVERIFIED | neon.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-nextjs-org | Source-defined endpoint nextjs.org | CONFIGURED_BUT_UNVERIFIED | nextjs.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-oauth2-googleapis-com | Source-defined endpoint oauth2.googleapis.com | CONFIGURED_BUT_UNVERIFIED | oauth2.googleapis.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-open-bigmodel-cn | Source-defined endpoint open.bigmodel.cn | CONFIGURED_BUT_UNVERIFIED | open.bigmodel.cn | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-openrouter-ai | Source-defined endpoint openrouter.ai | CONFIGURED_BUT_UNVERIFIED | openrouter.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-packaging-python-org | Source-defined endpoint packaging.python.org | CONFIGURED_BUT_UNVERIFIED | packaging.python.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-play-google-com | Source-defined endpoint play.google.com | CONFIGURED_BUT_UNVERIFIED | play.google.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-pollinations-ai | Source-defined endpoint pollinations.ai | CONFIGURED_BUT_UNVERIFIED | pollinations.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-polygon-technology | Source-defined endpoint polygon.technology | CONFIGURED_BUT_UNVERIFIED | polygon.technology | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-posthog-com | Source-defined endpoint posthog.com | CONFIGURED_BUT_UNVERIFIED | posthog.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-public-example-invalid | Source-defined endpoint public.example.invalid | CONFIGURED_BUT_UNVERIFIED | public.example.invalid | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-railway-app | Source-defined endpoint railway.app | CONFIGURED_BUT_UNVERIFIED | railway.app | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-react-dev | Source-defined endpoint react.dev | CONFIGURED_BUT_UNVERIFIED | react.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-schema-org | Source-defined endpoint schema.org | CONFIGURED_BUT_UNVERIFIED | schema.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-sentry-io | Source-defined endpoint sentry.io | CONFIGURED_BUT_UNVERIFIED | sentry.io | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-solana-com | Source-defined endpoint solana.com | CONFIGURED_BUT_UNVERIFIED | solana.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-stripe-com | Source-defined endpoint stripe.com | CONFIGURED_BUT_UNVERIFIED | stripe.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-studio-youtube-com | Source-defined endpoint studio.youtube.com | CONFIGURED_BUT_UNVERIFIED | studio.youtube.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-supabase-com | Source-defined endpoint supabase.com | CONFIGURED_BUT_UNVERIFIED | supabase.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-support-bolt-new | Source-defined endpoint support.bolt.new | CONFIGURED_BUT_UNVERIFIED | support.bolt.new | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-twitter-com | Source-defined endpoint twitter.com | CONFIGURED_BUT_UNVERIFIED | twitter.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-upload-wikimedia-org | Source-defined endpoint upload.wikimedia.org | CONFIGURED_BUT_UNVERIFIED | upload.wikimedia.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-v0-dev | Source-defined endpoint v0.dev | CONFIGURED_BUT_UNVERIFIED | v0.dev | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-vercel-com | Source-defined endpoint vercel.com | CONFIGURED_BUT_UNVERIFIED | vercel.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-wa-me | Source-defined endpoint wa.me | CONFIGURED_BUT_UNVERIFIED | wa.me | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-web3-okx-com | Source-defined endpoint web3.okx.com | CONFIGURED_BUT_UNVERIFIED | web3.okx.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-anchor-lang-com | Source-defined endpoint www.anchor-lang.com | CONFIGURED_BUT_UNVERIFIED | www.anchor-lang.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-anera-org | Source-defined endpoint www.anera.org | CONFIGURED_BUT_UNVERIFIED | www.anera.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-anthropic-com | Source-defined endpoint www.anthropic.com | CONFIGURED_BUT_UNVERIFIED | www.anthropic.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-bnbchain-org | Source-defined endpoint www.bnbchain.org | CONFIGURED_BUT_UNVERIFIED | www.bnbchain.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-cloudflare-com | Source-defined endpoint www.cloudflare.com | CONFIGURED_BUT_UNVERIFIED | www.cloudflare.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-domainconnect-org | Source-defined endpoint www.domainconnect.org | CONFIGURED_BUT_UNVERIFIED | www.domainconnect.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-dropbox-com | Source-defined endpoint www.dropbox.com | CONFIGURED_BUT_UNVERIFIED | www.dropbox.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-facebook-com | Source-defined endpoint www.facebook.com | CONFIGURED_BUT_UNVERIFIED | www.facebook.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-figma-com | Source-defined endpoint www.figma.com | CONFIGURED_BUT_UNVERIFIED | www.figma.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-google-com | Source-defined endpoint www.google.com | CONFIGURED_BUT_UNVERIFIED | www.google.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-googleapis-com | Source-defined endpoint www.googleapis.com | CONFIGURED_BUT_UNVERIFIED | www.googleapis.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-googletagmanager-com | Source-defined endpoint www.googletagmanager.com | CONFIGURED_BUT_UNVERIFIED | www.googletagmanager.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-hubspot-com | Source-defined endpoint www.hubspot.com | CONFIGURED_BUT_UNVERIFIED | www.hubspot.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-instagram-com | Source-defined endpoint www.instagram.com | CONFIGURED_BUT_UNVERIFIED | www.instagram.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-intercom-com | Source-defined endpoint www.intercom.com | CONFIGURED_BUT_UNVERIFIED | www.intercom.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-linkedin-com | Source-defined endpoint www.linkedin.com | CONFIGURED_BUT_UNVERIFIED | www.linkedin.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-mantle-xyz | Source-defined endpoint www.mantle.xyz | CONFIGURED_BUT_UNVERIFIED | www.mantle.xyz | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-map-org-uk | Source-defined endpoint www.map.org.uk | CONFIGURED_BUT_UNVERIFIED | www.map.org.uk | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-notion-so | Source-defined endpoint www.notion.so | CONFIGURED_BUT_UNVERIFIED | www.notion.so | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-openstreetmap-org | Source-defined endpoint www.openstreetmap.org | CONFIGURED_BUT_UNVERIFIED | www.openstreetmap.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-pcrf-net | Source-defined endpoint www.pcrf.net | CONFIGURED_BUT_UNVERIFIED | www.pcrf.net | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-perplexity-ai | Source-defined endpoint www.perplexity.ai | CONFIGURED_BUT_UNVERIFIED | www.perplexity.ai | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-pinterest-com | Source-defined endpoint www.pinterest.com | CONFIGURED_BUT_UNVERIFIED | www.pinterest.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-reddit-com | Source-defined endpoint www.reddit.com | CONFIGURED_BUT_UNVERIFIED | www.reddit.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-redditinc-com | Source-defined endpoint www.redditinc.com | CONFIGURED_BUT_UNVERIFIED | www.redditinc.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-semrush-com | Source-defined endpoint www.semrush.com | CONFIGURED_BUT_UNVERIFIED | www.semrush.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-shopify-com | Source-defined endpoint www.shopify.com | CONFIGURED_BUT_UNVERIFIED | www.shopify.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-spaceship-com | Source-defined endpoint www.spaceship.com | CONFIGURED_BUT_UNVERIFIED | www.spaceship.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-threads-net | Source-defined endpoint www.threads.net | CONFIGURED_BUT_UNVERIFIED | www.threads.net | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-tiktok-com | Source-defined endpoint www.tiktok.com | CONFIGURED_BUT_UNVERIFIED | www.tiktok.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-typescriptlang-org | Source-defined endpoint www.typescriptlang.org | CONFIGURED_BUT_UNVERIFIED | www.typescriptlang.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-unrwa-org | Source-defined endpoint www.unrwa.org | CONFIGURED_BUT_UNVERIFIED | www.unrwa.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-w3-org | Source-defined endpoint www.w3.org | CONFIGURED_BUT_UNVERIFIED | www.w3.org | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-xero-com | Source-defined endpoint www.xero.com | CONFIGURED_BUT_UNVERIFIED | www.xero.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-www-youtube-com | Source-defined endpoint www.youtube.com | CONFIGURED_BUT_UNVERIFIED | www.youtube.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-x-com | Source-defined endpoint x.com | CONFIGURED_BUT_UNVERIFIED | x.com | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-xroga-local | Source-defined endpoint xroga.local | LOCAL_ONLY | xroga.local | NOT_INDEPENDENTLY_VERIFIED |
| endpoint-xrogaaicom-vercel-app | Source-defined endpoint xrogaaicom.vercel.app | CONFIGURED_BUT_UNVERIFIED | xrogaaicom.vercel.app | NOT_INDEPENDENTLY_VERIFIED |
| runtime-controls-and-conditional-aliases | Existing operator/system configuration | CONFIGURED_BUT_UNVERIFIED | Unknown/not applicable | NOT_INDEPENDENTLY_VERIFIED |

## Evidence

- WEB-RELEASE-20261013: https://xroga.com/api/release; observed 2026-10-13T11:45:02.6304913Z; HTTP_200; 3b2bad21561e8abcb9a4a3bd0e98a7241d0efc3d.
- API-HEALTH-20261013: https://xroga-api.fly.dev/health; observed 2026-10-13T11:43:30.6359506Z; HTTP_200_OK; 41665b7f9a8e593c1d4d0ce42272c32f6ee7c6b2.
- API-READY-20261013: https://xroga-api.fly.dev/ready; observed 2026-10-13T11:43:31.1647828Z; HTTP_200_READY; 41665b7f9a8e593c1d4d0ce42272c32f6ee7c6b2.
- SUPABASE-PROJECT-20261013: Authenticated Supabase project metadata; observed 2026-10-13 (UTC day; RPC timestamp not returned); ACTIVE_HEALTHY; no application SHA claimed.
- SUPABASE-LEGACY-20261013: Authenticated Supabase project metadata; observed 2026-10-13 (UTC day; RPC timestamp not returned); INACTIVE; no application SHA claimed.
- VERCEL-PROJECT-20261013: Authenticated Vercel project metadata; observed 2026-10-13 (UTC day; RPC timestamp not returned); NEXTJS_CONFIGURED_NODE_24_X; no application SHA claimed.
- FLY-RELEASE-CI: https://github.com/Xroga/xroga.com/actions/runs/38135445708; observed 2026-10-13 (UTC observation day); EXISTING_DEPLOYMENT_SUCCESS; 41665b7f9a8e593c1d4d0ce42272c32f6ee7c6b2.
- FLY-SANDBOX-HISTORICAL: https://github.com/Xroga/xroga.com/actions/runs/37031296255; observed 2026-10-13 (UTC observation day); HISTORICAL_VERIFICATION_SUCCESS_NOT_CURRENT_LIVENESS; fc65cc3783cd307f180ee3e383d0d9859906a58f.

Frontend release 3b2bad and API release 41665b legitimately differ: the initial main/backend/config tree is equivalent to the last API release. Different component SHAs alone do not prove stale API code. Vercel's configured Node 24.x differs from canonical CI/API 22.21.1; no hosting setting was changed. Local Fly CLI has no token; deeper current app/resource/secret metadata remains unverified. Supabase's older LOGIN project is inactive and is not an approved test project. DNS registrar ownership is not established by a checked-in hostname.

## Risks and incomplete evidence

- P1 TEST_REALM_PIN: Production realm stays pinned; an explicit isolated CI build is now admitted, but real authenticated E2E configuration and verification remain blocked. Owner command: 007; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P1 EPHEMERAL_ARTIFACT_FALLBACK: Canonical file fallback removed; legacy cached/public objects not migrated and full private R2/staging durability/quota acceptance remains blocked. Owner command: 007–010; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P1 EPHEMERAL_BUDGET_FALLBACK: Absent durable billing credentials activates process-only cycles/reservations; quota also falls back after DB/RPC errors. Guest rate/token/concurrency/claim limits fall back from Redis to maps. UniversalCostLedger is explicitly in-process; BillingService also defines process-only fulfilled-payment deduplication. Restart/cross-process accounting cannot rely on these stores. Owner command: 008; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P1 RUN_PERSISTENCE_GAP: Run persistence returns without service-role configuration and scheduled writes swallow failures; hot run maps are not durable evidence of saved history. Owner command: 007–008; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P1 UNIVERSAL_MEMORY_ADMISSION: universalStore defaults to owner-keyed memory without a client; runtime-store and operational evidence/idempotency map implementations also exist. Durable production admission/caller reachability must be proved, not inferred from class names. Owner command: 007–008; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P1 OAUTH_PLAINTEXT_MIRROR: OAuth/PKCE plaintext DB/private JSON mirror; encryption, expiry, one-use and KMS cutover need verified migration. Owner command: 009; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P1 QUEUE_CONSUMERS_ABSENT: Four queue definitions, no discovered Worker consumers; client construction is not queue readiness. Owner command: LATER; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P1 KMS_UNPROVEN: BYOK AES-GCM exists; encryptionKey can derive from platform service-role/JWT credentials and has a fixed development fallback guarded only by NODE_ENV. Actual managed production key authority/AAD/rotation is not established; no key values were read. Owner command: 009; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P1 RELEASE_CONTROLS_UNENFORCED: Observed main and Production/Preview lack platform protection/restrictions; mandatory user release gates still apply. Owner command: 010; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.
- P2 HOST_TOOLCHAIN_DRIFT: Vercel project configured Node 24.x; canonical CI/API image is 22.21.1; Fly host test workflow has no explicit setup-node. Owner command: 006; RECORDED_PRE_EXISTING_RISK_NOT_WAIVED.

699 scoped memory/filesystem candidates are retained for semantic review. Static collections and scratch writes are not automatically unsafe fallbacks; the candidate inventory is not blanket durability certification. All consequential persistence/authority callers require the later security gates. Production/Preview environment protection and main rulesets were inspected as empty; user-mandated release gates still apply. Cloud Run/Jobs/Cloudflare Workers hosting remains proposed; no migration is authorized.

## Boundaries

Frontend → API routing: canonical xroga.com/xroga-api.fly.dev, with explicitly local development overrides. OAuth redirects target the existing dashboard callback paths; user-owned integrations are separate from platform auth. Whop platform billing and user-owned publishing/payment integrations must not be conflated. Callback/billing/provider readiness is not inferred from metadata or configuration names. Region/timeout/retry gaps remain explicit in each record. No new secret, payment, external action, DNS setting, provider or database was changed.
