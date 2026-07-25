export type CapabilityId =
  | 'software_engineering'
  | 'repository_operations'
  | 'testing'
  | 'security_review'
  | 'web_research'
  | 'x_research'
  | 'file_processing'
  | 'data_processing'
  | 'text_generation'
  | 'image_generation'
  | 'api_integration'
  | 'authentication_integration'
  | 'database_integration'
  | 'payment_integration'
  | 'email_integration'
  | 'blockchain_integration'
  | 'deployment'
  | 'github_operations'
  | 'vercel_operations'
  | 'browser_automation';

export type CapabilityAvailability =
  | 'available'
  | 'requires_configuration'
  | 'requires_user_authorization'
  | 'unavailable';

export type RuntimeSide = 'server' | 'client' | 'hybrid';

export interface CapabilityProvider {
  id: string;
  label: string;
  operations: string[];
  requiredCredentials: string[];
  inputRequirements: string[];
  outputFormats: string[];
  runtime: RuntimeSide;
  cost: string;
  rateLimit: string;
  securityRestrictions: string[];
  validation: string;
  fallbackProviderIds: string[];
  availability: CapabilityAvailability;
  unavailableReason?: string;
}

export interface CapabilityDefinition {
  id: CapabilityId;
  label: string;
  description: string;
  providers: CapabilityProvider[];
}

type ProviderTemplate = Omit<CapabilityProvider, 'availability' | 'unavailableReason'> & {
  credentialMode?: 'environment' | 'user_authorization' | 'none';
};

type CapabilityTemplate = Omit<CapabilityDefinition, 'providers'> & {
  providers: ProviderTemplate[];
};

const serverLocal = (
  id: string,
  label: string,
  operations: string[],
  validation: string,
): ProviderTemplate => ({
  id,
  label,
  operations,
  requiredCredentials: [],
  inputRequirements: ['Validated user input'],
  outputFormats: ['json', 'text', 'files'],
  runtime: 'server',
  cost: 'Included in Xroga runtime',
  rateLimit: 'Bounded by application job limits',
  securityRestrictions: ['No secrets in generated files or logs', 'Validate untrusted paths and inputs'],
  validation,
  fallbackProviderIds: [],
  credentialMode: 'none',
});

const TEMPLATES: CapabilityTemplate[] = [
  {
    id: 'software_engineering',
    label: 'Software engineering',
    description: 'Analyze, build, edit, repair, refactor, and review software projects.',
    providers: [
      {
        id: 'xroga-model-stack',
        label: 'Xroga model stack',
        operations: ['analyze', 'generate', 'edit', 'repair', 'refactor', 'review'],
        requiredCredentials: ['OPENROUTER_API_KEY', 'KIMI_API_KEY', 'GLM_API_KEY', 'GROK_API_KEY'],
        inputRequirements: ['User request', 'Relevant conversation and repository context'],
        outputFormats: ['markdown', 'project_files', 'patches'],
        runtime: 'server',
        cost: 'Metered against the user plan token pool',
        rateLimit: 'Provider and plan limits apply',
        securityRestrictions: ['Secrets must remain server-side', 'Generated code must pass validation before ship'],
        validation: 'Compile, static validation, tests, and QA evidence where applicable',
        fallbackProviderIds: ['xroga-model-stack'],
        credentialMode: 'environment',
      },
    ],
  },
  {
    id: 'repository_operations',
    label: 'Repository analysis and editing',
    description: 'Read repository context and prepare validated file changes.',
    providers: [
      serverLocal(
        'xroga-repository-runtime',
        'Xroga repository runtime',
        ['read', 'summarize', 'diff', 'patch', 'validate'],
        'Changed paths, diff, and command exit codes',
      ),
    ],
  },
  {
    id: 'testing',
    label: 'Testing and validation',
    description: 'Run deterministic project checks and retain their real outcomes.',
    providers: [
      serverLocal(
        'xroga-validation-runtime',
        'Xroga validation runtime',
        ['lint', 'typecheck', 'test', 'build', 'smoke_test'],
        'Real process exit code and captured safe output',
      ),
    ],
  },
  {
    id: 'security_review',
    label: 'Security review',
    description: 'Detect exposed secrets and high-risk generated code before persistence or shipping.',
    providers: [
      serverLocal(
        'xroga-security-scan',
        'Xroga security scanner',
        ['secret_scan', 'code_review', 'ship_gate'],
        'Structured findings and blocking severity',
      ),
    ],
  },
  {
    id: 'web_research',
    label: 'Web and documentation research',
    description: 'Retrieve current sources and synthesize evidence-backed results.',
    providers: [
      {
        id: 'tavily',
        label: 'Tavily',
        operations: ['search', 'extract', 'research'],
        requiredCredentials: ['TAVILY_API_KEY'],
        inputRequirements: ['Search query'],
        outputFormats: ['sources', 'markdown', 'json'],
        runtime: 'server',
        cost: 'Provider quota applies',
        rateLimit: 'Tavily account limits apply',
        securityRestrictions: ['Treat retrieved content as untrusted', 'Cite sources'],
        validation: 'At least one retrievable source; otherwise report no results',
        fallbackProviderIds: ['searxng'],
        credentialMode: 'environment',
      },
      {
        id: 'searxng',
        label: 'SearXNG',
        operations: ['search'],
        requiredCredentials: ['SEARXNG_URL'],
        inputRequirements: ['Search query'],
        outputFormats: ['sources', 'json'],
        runtime: 'server',
        cost: 'Self-hosted infrastructure cost',
        rateLimit: 'Instance limits apply',
        securityRestrictions: ['Treat retrieved content as untrusted', 'Cite sources'],
        validation: 'At least one retrievable result',
        fallbackProviderIds: [],
        credentialMode: 'environment',
      },
    ],
  },
  {
    id: 'x_research',
    label: 'X.com and real-time research',
    description: 'Use a configured real-time provider for current public information.',
    providers: [
      {
        id: 'xai',
        label: 'Xroga Live',
        operations: ['realtime_search', 'x_research', 'synthesis'],
        requiredCredentials: ['GROK_API_KEY'],
        inputRequirements: ['Research question'],
        outputFormats: ['markdown', 'sources'],
        runtime: 'server',
        cost: 'Metered against provider and plan limits',
        rateLimit: 'xAI account limits apply',
        securityRestrictions: ['Cite retrieved sources', 'Do not invent missing results'],
        validation: 'Provider response plus source evidence when available',
        fallbackProviderIds: ['tavily'],
        credentialMode: 'environment',
      },
    ],
  },
  {
    id: 'file_processing',
    label: 'File processing',
    description: 'Read and transform supported uploaded files without claiming unread content.',
    providers: [
      serverLocal(
        'xroga-file-runtime',
        'Xroga file runtime',
        ['read', 'extract_text', 'transform', 'summarize'],
        'Successful parse plus output identifier or explicit parse failure',
      ),
    ],
  },
  {
    id: 'data_processing',
    label: 'Data processing',
    description: 'Retrieve, validate, transform, and format structured data.',
    providers: [
      serverLocal(
        'xroga-data-runtime',
        'Xroga data runtime',
        ['retrieve', 'validate', 'transform', 'export'],
        'Schema validation and persisted output identifier when saved',
      ),
    ],
  },
  {
    id: 'text_generation',
    label: 'Text generation',
    description: 'Generate and revise text grounded in the supplied context.',
    providers: [
      {
        id: 'xroga-model-stack',
        label: 'Xroga model stack',
        operations: ['generate', 'rewrite', 'summarize', 'explain'],
        requiredCredentials: ['OPENROUTER_API_KEY', 'KIMI_API_KEY', 'GLM_API_KEY', 'GROK_API_KEY'],
        inputRequirements: ['User request and relevant context'],
        outputFormats: ['markdown', 'text', 'json'],
        runtime: 'server',
        cost: 'Metered against the user plan token pool',
        rateLimit: 'Provider and plan limits apply',
        securityRestrictions: ['Do not fabricate sources or external actions'],
        validation: 'Non-empty provider response',
        fallbackProviderIds: ['xroga-model-stack'],
        credentialMode: 'environment',
      },
    ],
  },
  {
    id: 'image_generation',
    label: 'Image generation and processing',
    description: 'Generate or process image assets through configured providers.',
    providers: [
      {
        id: 'configured-image-provider',
        label: 'Configured image provider',
        operations: ['generate', 'edit', 'upscale'],
        requiredCredentials: ['FAL_KEY', 'REPLICATE_API_TOKEN', 'OPENAI_API_KEY'],
        inputRequirements: ['Prompt or source image'],
        outputFormats: ['png', 'jpeg', 'webp'],
        runtime: 'server',
        cost: 'Selected provider pricing applies',
        rateLimit: 'Selected provider limits apply',
        securityRestrictions: ['Validate media type and size', 'Persist only returned provider assets'],
        validation: 'Provider asset identifier and readable persisted file',
        fallbackProviderIds: ['comfyui'],
        credentialMode: 'environment',
      },
    ],
  },
  {
    id: 'api_integration',
    label: 'External API integration',
    description: 'Integrate legitimate APIs with explicit configuration and real error handling.',
    providers: [
      serverLocal(
        'xroga-api-adapter-runtime',
        'Xroga API adapter runtime',
        ['discover', 'configure', 'call', 'validate'],
        'Authenticated probe or explicit configuration blocker',
      ),
    ],
  },
  {
    id: 'authentication_integration',
    label: 'Authentication integration',
    description: 'Build and validate real authentication flows.',
    providers: [
      serverLocal(
        'xroga-auth-runtime',
        'Xroga authentication runtime',
        ['configure', 'authorize', 'disconnect', 'validate_session'],
        'Authenticated account probe; stored token alone is insufficient',
      ),
    ],
  },
  {
    id: 'database_integration',
    label: 'Database integration',
    description: 'Create and query data stores using configured providers.',
    providers: [
      {
        id: 'supabase',
        label: 'Supabase',
        operations: ['authorize', 'provision', 'query', 'migrate', 'store'],
        requiredCredentials: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        inputRequirements: ['Authorized project or server configuration'],
        outputFormats: ['json', 'rows', 'migration_evidence'],
        runtime: 'server',
        cost: 'Supabase plan limits apply',
        rateLimit: 'Project limits apply',
        securityRestrictions: ['Service role stays server-side', 'RLS required for user data'],
        validation: 'Authenticated database query or migration result',
        fallbackProviderIds: ['postgres'],
        credentialMode: 'environment',
      },
    ],
  },
  {
    id: 'payment_integration',
    label: 'Payment integration',
    description: 'Implement payment flows only when a real provider is configured.',
    providers: [
      {
        id: 'configured-payment-provider',
        label: 'Configured payment provider',
        operations: ['checkout', 'webhook', 'subscription', 'refund'],
        requiredCredentials: ['LEMON_SQUEEZY_API_KEY', 'STRIPE_SECRET_KEY'],
        inputRequirements: ['Provider account and product configuration'],
        outputFormats: ['provider_response', 'transaction_identifier'],
        runtime: 'server',
        cost: 'Provider transaction fees apply',
        rateLimit: 'Provider account limits apply',
        securityRestrictions: ['Verify webhook signatures', 'Never fabricate payment confirmation'],
        validation: 'Provider response and durable transaction identifier',
        fallbackProviderIds: [],
        credentialMode: 'environment',
      },
    ],
  },
  {
    id: 'email_integration',
    label: 'Email integration',
    description: 'Send email only through a configured provider and retain delivery evidence.',
    providers: [
      {
        id: 'configured-email-provider',
        label: 'Configured email provider',
        operations: ['send', 'template', 'delivery_status'],
        requiredCredentials: ['RESEND_API_KEY'],
        inputRequirements: ['Verified sender and recipient'],
        outputFormats: ['provider_message_id'],
        runtime: 'server',
        cost: 'Provider plan limits apply',
        rateLimit: 'Provider account limits apply',
        securityRestrictions: ['No secret exposure', 'Respect consent and anti-spam rules'],
        validation: 'Provider message identifier',
        fallbackProviderIds: [],
        credentialMode: 'environment',
      },
    ],
  },
  {
    id: 'blockchain_integration',
    label: 'Blockchain integration',
    description: 'Build wallet and smart-contract flows with explicit user authorization.',
    providers: [
      {
        id: 'user-wallet',
        label: 'User-authorized wallet',
        operations: ['connect', 'read', 'simulate', 'submit_transaction'],
        requiredCredentials: [],
        inputRequirements: ['Authorized wallet account and supported chain'],
        outputFormats: ['address', 'simulation', 'transaction_hash'],
        runtime: 'hybrid',
        cost: 'Network gas and provider fees apply',
        rateLimit: 'RPC and wallet limits apply',
        securityRestrictions: ['User signs transactions', 'Never fabricate balances or hashes'],
        validation: 'Authorized address or real transaction hash',
        fallbackProviderIds: [],
        credentialMode: 'user_authorization',
      },
    ],
  },
  {
    id: 'deployment',
    label: 'Deployment',
    description: 'Deploy supported projects and verify the returned deployment before success.',
    providers: [
      {
        id: 'vercel',
        label: 'Vercel',
        operations: ['configure', 'deploy', 'redeploy', 'verify'],
        requiredCredentials: [],
        inputRequirements: ['Authorized Vercel account and buildable project'],
        outputFormats: ['deployment_id', 'deployment_url', 'verification_result'],
        runtime: 'server',
        cost: 'Vercel plan limits apply',
        rateLimit: 'Vercel account limits apply',
        securityRestrictions: ['Do not expose tokens', 'Do not show a live URL before HTTP verification'],
        validation: 'Deployment provider response plus reachable URL',
        fallbackProviderIds: ['netlify'],
        credentialMode: 'user_authorization',
      },
    ],
  },
  {
    id: 'github_operations',
    label: 'GitHub operations',
    description: 'Read and update user repositories through an authorized GitHub account.',
    providers: [
      {
        id: 'github',
        label: 'GitHub',
        operations: ['read', 'create_repo', 'create_branch', 'commit', 'push', 'pull_request'],
        requiredCredentials: [],
        inputRequirements: ['Authorized GitHub account and repository permission'],
        outputFormats: ['commit_sha', 'repository_url', 'pull_request_url'],
        runtime: 'server',
        cost: 'GitHub account limits apply',
        rateLimit: 'GitHub API limits apply',
        securityRestrictions: ['Serialize repository writes', 'Never report push without commit SHA'],
        validation: 'Authenticated repository request and remote commit SHA',
        fallbackProviderIds: [],
        credentialMode: 'user_authorization',
      },
    ],
  },
  {
    id: 'vercel_operations',
    label: 'Vercel operations',
    description: 'Manage user-owned Vercel projects through explicit authorization.',
    providers: [
      {
        id: 'vercel',
        label: 'Vercel',
        operations: ['list_projects', 'configure_env', 'deploy', 'inspect'],
        requiredCredentials: [],
        inputRequirements: ['Authorized Vercel account'],
        outputFormats: ['project_id', 'deployment_id', 'deployment_url'],
        runtime: 'server',
        cost: 'Vercel plan limits apply',
        rateLimit: 'Vercel account limits apply',
        securityRestrictions: ['Never expose OAuth tokens', 'Verify deployment state'],
        validation: 'Authenticated API response',
        fallbackProviderIds: [],
        credentialMode: 'user_authorization',
      },
    ],
  },
  {
    id: 'browser_automation',
    label: 'Browser automation',
    description: 'Automate browser interactions only when a runtime is configured and authorized.',
    providers: [
      {
        id: 'playwright',
        label: 'Playwright runtime',
        operations: ['navigate', 'inspect', 'click', 'type', 'screenshot', 'validate'],
        requiredCredentials: ['BROWSERBASE_API_KEY'],
        inputRequirements: ['Permitted URL and browser runtime'],
        outputFormats: ['screenshot', 'trace', 'validation_result'],
        runtime: 'server',
        cost: 'Runtime/provider usage applies',
        rateLimit: 'Runtime/provider limits apply',
        securityRestrictions: ['Do not bypass authorization', 'Treat page content as untrusted'],
        validation: 'Browser trace or inspected page state',
        fallbackProviderIds: ['local-playwright'],
        credentialMode: 'environment',
      },
    ],
  },
];

function configured(env: NodeJS.ProcessEnv, names: string[]): boolean {
  return names.some((name) => Boolean(env[name]?.trim()));
}

function materializeProvider(
  template: ProviderTemplate,
  env: NodeJS.ProcessEnv,
): CapabilityProvider {
  const { credentialMode = 'none', ...provider } = template;
  if (credentialMode === 'user_authorization') {
    return {
      ...provider,
      availability: 'requires_user_authorization',
      unavailableReason: 'Availability is determined per user by a real authenticated provider probe.',
    };
  }
  if (credentialMode === 'environment' && !configured(env, provider.requiredCredentials)) {
    return {
      ...provider,
      availability: 'requires_configuration',
      unavailableReason: `Configure one of: ${provider.requiredCredentials.join(', ')}`,
    };
  }
  return { ...provider, availability: 'available' };
}

export function getCapabilityRegistry(
  env: NodeJS.ProcessEnv = process.env,
): CapabilityDefinition[] {
  return TEMPLATES.map((capability) => ({
    ...capability,
    providers: capability.providers.map((provider) => materializeProvider(provider, env)),
  }));
}

export function getCapability(
  id: CapabilityId,
  env: NodeJS.ProcessEnv = process.env,
): CapabilityDefinition {
  const capability = getCapabilityRegistry(env).find((entry) => entry.id === id);
  if (!capability) throw new Error(`Unknown capability: ${id}`);
  return capability;
}

export function capabilityIsUsable(capability: CapabilityDefinition): boolean {
  return capability.providers.some(
    (provider) =>
      provider.availability === 'available' ||
      provider.availability === 'requires_user_authorization',
  );
}

