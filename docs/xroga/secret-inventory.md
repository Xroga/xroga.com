# Secret and environment name inventory

Values are forbidden. Source SHA: `8db36c5b82203610048159c8b558a16c1e6a31ad`. Names and source discovery do not prove that a capability is configured or accepted.

| Name | Classification | Requirement | Dependency |
| --- | --- | --- | --- |
| AGNES_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| AHREFS_API_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| ANTHROPIC_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| APIFY_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-apify-com, endpoint-jobs-example-com |
| AUPHONIC_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| BIGMODEL_API_KEY | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| BLACK_HOLE_CUTOVER_STAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| BLACK_HOLE_ROLLOUT_PERCENT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| BREVO_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| BROWSERBASE_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | browserbase |
| BROWSERBASE_PROJECT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | browserbase |
| CARTESIA_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-cartesia-ai, endpoint-api-elevenlabs-io, endpoint-api-fish-audio, endpoint-api-suno-ai |
| CARTESIA_VOICE_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-api-cartesia-ai, endpoint-api-elevenlabs-io, endpoint-api-fish-audio, endpoint-api-suno-ai |
| CI | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-github-com, endpoint-api-vercel-com, endpoint-api-whop-com, endpoint-backend-composio-dev, endpoint-example-invalid, endpoint-fixture, endpoint-fixture-invalid, endpoint-fixture-supabase-co, endpoint-fixtureproject-supabase-co, endpoint-open-bigmodel-cn, endpoint-public-example-invalid, endpoint-whop-com |
| CLOUDFLARE_ACCOUNT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | r2 |
| CLOUDFLARE_R2_ACCESS_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | r2 |
| CLOUDFLARE_R2_ACCOUNT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | r2 |
| CLOUDFLARE_R2_BUCKET | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | r2 |
| CLOUDFLARE_R2_METADATA_READ_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | r2 |
| CLOUDFLARE_R2_PRIVATE_BUCKET | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | r2, endpoint-127-0-0-1, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| CLOUDFLARE_R2_SECRET_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | r2 |
| CLOUDFLARE_VOICE_ACCOUNT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | cloudflare-voice |
| CLOUDFLARE_VOICE_API_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | cloudflare-voice |
| CLOUDFLARE_VOICE_FREE_PLAN_CONFIRMED | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | cloudflare-voice |
| CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| CLOUD_RUN_EXECUTION | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| CLOUD_RUN_JOB | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| COMFYUI_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| COMPOSIO_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-127-0-0-1, endpoint-backend-composio-dev |
| COMPOSIO_WEBHOOK_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| DATABASE_URL | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | supabase |
| DEEPDUB_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| DEEPGRAM_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| DEEPINFRA_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| DEEPSEEK_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| DEEPSEEK_CODE_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| DEEPSEEK_FLASH_CONTEXT_WINDOW | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| DEEPSEEK_FLASH_INPUT_USD_PER_1M | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| DEEPSEEK_FLASH_MODEL_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| DEEPSEEK_FLASH_OUTPUT_USD_PER_1M | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| DESCRIPT_API_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| DID_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| E2E_BACKEND_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| E2E_ISOLATED_PROJECT_REF | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1 |
| ELEVENLABS_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-cartesia-ai, endpoint-api-elevenlabs-io, endpoint-api-fish-audio, endpoint-api-suno-ai |
| ELEVENLABS_VOICE_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-api-cartesia-ai, endpoint-api-elevenlabs-io, endpoint-api-fish-audio, endpoint-api-suno-ai |
| EXA_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-exa-ai |
| EXPECTED_RELEASE_SHA | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1 |
| FAL_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| FAL_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| FISH_AUDIO_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-cartesia-ai, endpoint-api-elevenlabs-io, endpoint-api-fish-audio, endpoint-api-suno-ai |
| FLY_APP_NAME | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-machines-dev, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid, endpoint-www-googleapis-com |
| FLY_MACHINE_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| FRONTEND_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | api, endpoint-127-0-0-1, endpoint-accounts-google-com, endpoint-api-github-com, endpoint-api-supabase-com, endpoint-api-vercel-com, endpoint-backend-composio-dev, endpoint-chrome-google-com, endpoint-chromewebstore-googleapis-com, endpoint-github-com, endpoint-localhost, endpoint-oauth2-googleapis-com, endpoint-vercel-com, endpoint-www-googleapis-com, endpoint-xroga-api-fly-dev, endpoint-xrogaaicom-vercel-app |
| GCE_METADATA_HOST | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GCE_METADATA_IP | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GEMINI_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-generativelanguage-googleapis-com |
| GEMINI_CODE_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| GITHUB_CLIENT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-github-com, endpoint-github-com, endpoint-localhost |
| GITHUB_CLIENT_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-127-0-0-1, endpoint-api-github-com, endpoint-github-com, endpoint-localhost |
| GITHUB_OAUTH_CALLBACK_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-github-com, endpoint-github-com, endpoint-localhost |
| GITHUB_SHA | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | api |
| GLM_5_3_CONTEXT_WINDOW | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GLM_5_3_FLASH_CONTEXT_WINDOW | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GLM_5_3_FLASH_INPUT_USD_PER_1M | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GLM_5_3_FLASH_MODEL_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GLM_5_3_FLASH_OUTPUT_USD_PER_1M | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GLM_5_3_INPUT_USD_PER_1M | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GLM_5_3_MODEL_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GLM_5_3_OUTPUT_USD_PER_1M | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GLM_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-127-0-0-1, endpoint-open-bigmodel-cn |
| GOOGLE_APPLICATION_CREDENTIALS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GOOGLE_CREDENTIALS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| GROK_SEARCH_MODEL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-api-x-ai |
| GROQ_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-groq-com |
| GROQ_CODE_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| HAILUO_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-minimax-io |
| HAILUO_UID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| HAPPYSCRIBE_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| HEYGEN_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| HEY_GEN_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| HF_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| HOME | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| HUGGINGFACE_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| IMMERSITY_CLIENT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| Immersity_Client_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| KIMI_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| KIMI_CONTEXT_WINDOW | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| KIMI_INPUT_USD_PER_1M | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| KIMI_MODEL_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| KIMI_OUTPUT_USD_PER_1M | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| KIMI_VISION_ENABLED | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| KLING_ACCESS_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| KLING_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| KLING_API_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| KLING_SECRET_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| K_REVISION | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-www-googleapis-com |
| K_SERVICE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-www-googleapis-com |
| LANG | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| LC_ALL | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| LEGACY_R2_PREFIX | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| LEGACY_WHOLE_PROJECT_BUILDER_ENABLED | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| LEMON_SQUEEZY_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| LUMA_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-lumalabs-ai |
| MEDIA_CACHE_DIR | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | local-media |
| MINIMAX_API_BASE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-api-minimax-io |
| MINIMAX_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-minimax-io |
| MINIMAX_GROUP_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| MISTRAL_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| MODEL_CIRCUIT_RECOVERY_MS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| MONGODB_URI | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| MOONSHOT_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| MORPH_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| NEON_DATABASE_URL | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| NETLIFY_ACCESS_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-github-com, endpoint-api-netlify-com, endpoint-api-vercel-com |
| NEXT_PUBLIC_API_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-127-0-0-1, endpoint-localhost |
| NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-analytics-ahrefs-com |
| NEXT_PUBLIC_PROMO_FULL_ACCESS_END | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend |
| NEXT_PUBLIC_SITE_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-localhost, endpoint-twitter-com, endpoint-wa-me, endpoint-www-facebook-com, endpoint-www-linkedin-com, endpoint-www-reddit-com |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | PUBLIC_CREDENTIAL | REQUIRED_FOR_CORE_AUTH | frontend, endpoint-127-0-0-1 |
| NEXT_PUBLIC_SUPABASE_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-127-0-0-1 |
| NEXT_PUBLIC_SUPPORT_PHONE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend |
| NEXT_PUBLIC_VERCEL_ENV | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend |
| NEXT_PUBLIC_VOICE_TRANSCRIPTION_MODE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend |
| NEXT_PUBLIC_XROGA_AUTH_BASE_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-127-0-0-1 |
| NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-127-0-0-1 |
| NEXT_PUBLIC_XROGA_BROWSER_RUNS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-example-com, endpoint-your-website-com |
| NEXT_PUBLIC_XROGA_BUILDER | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend |
| NEXT_PUBLIC_XROGA_DRIVE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend |
| NODE_ENV | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | api, endpoint-127-0-0-1, endpoint-accounts-google-com, endpoint-api-github-com, endpoint-api-vercel-com, endpoint-backend-composio-dev, endpoint-chrome-google-com, endpoint-chromewebstore-googleapis-com, endpoint-github-com, endpoint-localhost, endpoint-oauth2-googleapis-com, endpoint-vercel-com, endpoint-www-googleapis-com, endpoint-xroga-api-fly-dev, endpoint-xrogaaicom-vercel-app |
| OPENAI_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| OPENAI_TRANSCRIBE_MODEL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-api-openai-com |
| OPENROUTER_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| PARALLEL_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-parallel-ai, endpoint-api-x-ai |
| PATH | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| PIAPI_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| PLAYWRIGHT_BROWSERS_PATH | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| PLAYWRIGHT_CHROMIUM_EXECUTABLE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| PORT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | api, endpoint-localhost, endpoint-xroga-api-fly-dev, endpoint-xrogaaicom-vercel-app |
| PROMO_FULL_ACCESS_END | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| PROMPT_CACHE_MAX | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| PROMPT_CACHE_TTL_MS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| REDIS_URL | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | redis |
| REPLICATE_API_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| REQUIRE_REMOTE_AUTH_CHECK | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-github-com |
| RESEND_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| RESPEECHER_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| RIME_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| RUNWAY_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-dev-runwayml-com |
| SEMANTIC_PLANNER_TOTAL_TIMEOUT_MS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| SHELL | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STABILITY_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| STABILITY_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| STORAGE_DB_SSL_CA | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STORAGE_MAX_OBJECT_BYTES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STORAGE_MIGRATION_APPROVER_PUBKEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| STORAGE_MIGRATION_ENV | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STORAGE_MULTIPART_PART_BYTES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STORAGE_QUOTA_BYTES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STORAGE_READ_ORDER | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STORAGE_SINGLE_PUT_MAX_BYTES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STORAGE_TEST_DATABASE_URL | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| STORAGE_WRITE_MODE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| STRIPE_PAYMENT_LINK | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-localhost |
| STRIPE_SECRET_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| SUNO_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-cartesia-ai, endpoint-api-elevenlabs-io, endpoint-api-fish-audio, endpoint-api-suno-ai |
| SUPABASE_ANON_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | supabase, endpoint-127-0-0-1, endpoint-api-github-com, endpoint-api-vercel-com, endpoint-api-whop-com, endpoint-backend-composio-dev, endpoint-example-invalid, endpoint-fixture-supabase-co, endpoint-fixtureproject-supabase-co, endpoint-public-example-invalid, endpoint-whop-com |
| SUPABASE_DB_PASSWORD | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | supabase |
| SUPABASE_DB_REGION | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | supabase |
| SUPABASE_DB_URL | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | supabase |
| SUPABASE_JWT_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | supabase |
| SUPABASE_OAUTH_CALLBACK_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | supabase, endpoint-127-0-0-1, endpoint-api-supabase-com, endpoint-localhost |
| SUPABASE_OAUTH_CLIENT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | supabase, endpoint-127-0-0-1, endpoint-api-supabase-com, endpoint-localhost |
| SUPABASE_OAUTH_CLIENT_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | supabase, endpoint-127-0-0-1, endpoint-api-supabase-com, endpoint-localhost |
| SUPABASE_POOLER_HOST | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | supabase |
| SUPABASE_PROJECT_REF | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | supabase |
| SUPABASE_SERVICE_ROLE_KEY | SERVER_CREDENTIAL | REQUIRED_FOR_CORE_AUTH | supabase, endpoint-127-0-0-1, endpoint-api-parallel-ai, endpoint-api-whop-com, endpoint-example-invalid, endpoint-fixture-supabase-co, endpoint-fixtureproject-supabase-co, endpoint-github-com, endpoint-localhost, endpoint-public-example-invalid, endpoint-supabase-management-tests-invalid, endpoint-xroga-api-fly-dev, endpoint-xrogaaicom-vercel-app |
| SUPABASE_URL | RUNTIME_CONFIGURATION | REQUIRED_FOR_CORE_AUTH | supabase, endpoint-127-0-0-1, endpoint-api-github-com, endpoint-api-vercel-com, endpoint-api-whop-com, endpoint-backend-composio-dev, endpoint-example-invalid, endpoint-fixture, endpoint-fixture-invalid, endpoint-fixture-supabase-co, endpoint-fixtureproject-supabase-co, endpoint-localhost, endpoint-open-bigmodel-cn, endpoint-public-example-invalid, endpoint-supabase-management-tests-invalid, endpoint-whop-com, endpoint-xroga-api-fly-dev, endpoint-xrogaaicom-vercel-app |
| SystemRoot | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| TERM | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| TMPDIR | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| TZ | SYSTEM_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| UNIVERSAL_AGENT_ALLOWLIST | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| UNIVERSAL_AGENT_ENABLED | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| UNIVERSAL_AGENT_PERCENTAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| UPSTASH_REDIS_REST_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| UPSTASH_VECTOR_REST_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| USERPROFILE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| USER_SECRETS_ENCRYPTION_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | credential-store, endpoint-127-0-0-1 |
| VERCEL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| VERCEL_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-github-com, endpoint-api-vercel-com |
| VERCEL_CLIENT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-vercel-com, endpoint-localhost, endpoint-vercel-com |
| VERCEL_CLIENT_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-127-0-0-1, endpoint-api-vercel-com, endpoint-localhost, endpoint-vercel-com |
| VERCEL_ENV | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-127-0-0-1, endpoint-schema-org |
| VERCEL_GIT_COMMIT_SHA | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | frontend, endpoint-127-0-0-1 |
| VERCEL_MANAGED_PROJECT_NAME | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-api-github-com, endpoint-api-vercel-com |
| VERCEL_OAUTH_CALLBACK_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-vercel-com, endpoint-localhost, endpoint-vercel-com |
| VERCEL_OAUTH_CLIENT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-vercel-com, endpoint-localhost, endpoint-vercel-com |
| VERCEL_OAUTH_CLIENT_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-127-0-0-1, endpoint-api-vercel-com, endpoint-localhost, endpoint-vercel-com |
| VERCEL_OAUTH_SCOPES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-vercel-com, endpoint-localhost, endpoint-vercel-com |
| VERCEL_PROJECT_PRODUCTION_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| VERCEL_TEAM_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-api-vercel-com |
| VERCEL_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| VERCEL_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| WHOP_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-127-0-0-1, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| WHOP_COMPANY_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| WHOP_PLAN_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| WHOP_REDIRECT_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| WHOP_WEBHOOK_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-127-0-0-1, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| XAI_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-api-x-ai |
| XB01_DISPOSABLE_SUPABASE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1, endpoint-api-github-com, endpoint-api-vercel-com, endpoint-api-whop-com, endpoint-backend-composio-dev, endpoint-example-invalid, endpoint-fixture, endpoint-fixture-invalid, endpoint-fixture-supabase-co, endpoint-fixtureproject-supabase-co, endpoint-open-bigmodel-cn, endpoint-public-example-invalid, endpoint-whop-com |
| XB01_LOCAL_DATABASE_URL | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-127-0-0-1, endpoint-api-whop-com, endpoint-backend-composio-dev, endpoint-example-invalid, endpoint-fixture-invalid, endpoint-public-example-invalid |
| XB01_TEST_SOURCE_SHA | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1 |
| XROGA_ALLOWED_MODELS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_AUTOMATION_SCHEDULER_AUDIENCE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_AUTOMATION_SCHEDULER_MODE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-localhost, endpoint-xroga-api-fly-dev, endpoint-xrogaaicom-vercel-app |
| XROGA_AUTOMATION_SCHEDULER_SERVICE_ACCOUNT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_BACKGROUND_EXECUTION_PROVIDER | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_BROWSER_AI_MODEL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_BROWSER_COORDINATOR_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_BROWSER_DISPATCH | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| XROGA_BROWSER_EXECUTE_AUDIENCE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| XROGA_BROWSER_EXECUTE_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| XROGA_BROWSER_PLANNER_MODEL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_BROWSER_TASKS_LOCATION | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| XROGA_BROWSER_TASKS_PROJECT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| XROGA_BROWSER_TASKS_QUEUE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| XROGA_BROWSER_WORKER_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_BUILDER_INPROCESS_QA | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_BUILDER_QA_HOST_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_BUILDER_QA_HOST_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_CIRCUIT_FAILURE_THRESHOLD | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_CLEANUP_JOB_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_CREDENTIAL_KMS_PROVIDER | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | credential-store |
| XROGA_DEPLOYMENT_ENVIRONMENT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1 |
| XROGA_DEV_CREDENTIAL_KEK | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_DISABLED_PROVIDERS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_DRIVE_PRESIGN_SIGN_LENGTH | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_DRIVE_R2_ACCESS_KEY_ID | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_DRIVE_R2_ACCOUNT_ID | PUBLIC_IDENTIFIER | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_DRIVE_R2_BUCKET | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_DRIVE_R2_SECRET_ACCESS_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_FLY_OIDC_IMAGE_DIGESTS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_FLY_OIDC_ISSUER | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_FLY_OIDC_ORGANIZATION_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_FORCE_RESEARCH_TASK_CLASSES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_GCE_ADMITTED_IMAGES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_BASE_IMAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_BASE_IMAGE_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_DEFAULT_IMAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_MAX_INSTANCES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_NODE_IMAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| XROGA_GCE_PROJECT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_PYTHON_IMAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| XROGA_GCE_RUST_IMAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| XROGA_GCE_SERVICE_ACCOUNT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_SUBNET | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_VERIFY_ONLY | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GCE_ZONE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-metadata-google-internal |
| XROGA_GITHUB_BOT_EMAIL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_GITHUB_BOT_NAME | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_GOOGLE_CLOUD_AUTH_MODE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery, endpoint-www-googleapis-com |
| XROGA_GOOGLE_CLOUD_KMS_KEY_NAME | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | google-delivery |
| XROGA_GOOGLE_DISPATCH_ACCOUNT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery |
| XROGA_GOOGLE_DISPATCH_REGION | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery |
| XROGA_GOOGLE_DISPATCH_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery |
| XROGA_GOOGLE_TASK_QUEUE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery |
| XROGA_GOOGLE_WIF_AUDIENCE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery |
| XROGA_GOOGLE_WIF_SERVICE_ACCOUNT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery |
| XROGA_GOOGLE_WORKER_IMAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery |
| XROGA_GOOGLE_WORKER_JOB | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-delivery |
| XROGA_ISOLATED_AUTH_BUILD | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1 |
| XROGA_LEARNING_ENABLED | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1 |
| XROGA_LEGACY_CREDENTIAL_MIGRATION | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_MAX_REPAIR_ATTEMPTS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_MODEL_FALLBACK_ORDER | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_OCI_KMS_AUTH_MODE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_OCI_KMS_ENDPOINT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_OCI_KMS_KEY_ID | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_OCI_KMS_KEY_VERSION | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_OCI_KMS_PRINCIPAL_ID | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_PER_TASK_TOKEN_CAP | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_PLAN_ROUTING_MODES_JSON | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_PLATFORM_CONFIG_FILE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | api, credential-store |
| XROGA_PREVIEW_BASE_DOMAIN | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| XROGA_PREVIEW_SCHEME | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| XROGA_PREVIEW_SIGNING_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | google-execution, endpoint-127-0-0-1 |
| XROGA_PROJECT_RUNTIME_PROVIDER | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-metadata-google-internal |
| XROGA_PROVIDER_BUDGETS_JSON | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_PROXY_JOB | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_PROXY_PASSWORD | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_PROXY_PORT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_PROXY_USERNAME | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_QA_HOST_ALLOWED_SUFFIXES | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_QA_HOST_MAX_CONCURRENT | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_QA_HOST_SECRET | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |
| XROGA_RELEASE_CANDIDATE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_RELEASE_SHA | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | api, endpoint-127-0-0-1, endpoint-metadata-google-internal |
| XROGA_REQUIRE_HIGH_RISK_REVIEW | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_REQUIRE_MANAGED_CUSTODY | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_ROUTING_MODE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_RUNTIME_ROLE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_SANDBOX_BROWSER_IMAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-127-0-0-1 |
| XROGA_SANDBOX_DISABLED | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| XROGA_SANDBOX_FLY_APP | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-127-0-0-1, endpoint-api-machines-dev, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| XROGA_SANDBOX_FLY_IMAGE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-api-machines-dev |
| XROGA_SANDBOX_FLY_REGION | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution, endpoint-api-machines-dev |
| XROGA_SANDBOX_FLY_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | google-execution, endpoint-127-0-0-1, endpoint-api-machines-dev, endpoint-api-whop-com, endpoint-example-invalid, endpoint-public-example-invalid |
| XROGA_SANDBOX_LIVE_TEST_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | google-execution |
| XROGA_SANDBOX_WORKER_NAME | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| XROGA_SANDBOX_WORKER_TOKEN | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | google-execution |
| XROGA_SANDBOX_WORKER_URL | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | google-execution |
| XROGA_SOFTWARE_AGENT_V2 | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_SOFTWARE_AGENT_V2_SHADOW | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_STAGING_AUTH_BUILD | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | endpoint-127-0-0-1 |
| XROGA_STORAGE_RECONCILE_MODE | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_TEST_CREDENTIAL_KEK | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| XROGA_TRUSTED_PROXY_HOPS | RUNTIME_CONFIGURATION | OPTIONAL_OR_DEFAULTED | runtime-controls-and-conditional-aliases |
| YOUTUBE_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | endpoint-www-googleapis-com, endpoint-www-youtube-com |
| ZHIPU_API_KEY | SERVER_CREDENTIAL | CONDITIONAL_ON_CAPABILITY | runtime-controls-and-conditional-aliases |

Production uses the existing protected Google Secret Manager configuration and native managed KMS. Account-specific connected credentials remain in the canonical encrypted CredentialVault. No personal developer login, legacy Fly credential or development-assistant session is a production requirement. Rotation and access changes require their applicable authority. Optional file delivery signing, Drive and later feature configuration remain independently gated.
