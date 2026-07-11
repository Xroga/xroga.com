'use client';

/** Shown when users hesitate to provide paid API keys — free alternatives. */
export function FreeApiOptionsPanel({ compact }: { compact?: boolean }) {
  const options = [
    { name: 'Groq', detail: 'Free tier · no credit card · fast inference', url: 'https://console.groq.com' },
    { name: 'Google Gemini', detail: '1,500 requests/day free', url: 'https://aistudio.google.com' },
    { name: 'Pollinations', detail: 'Text + images · no API key required', url: 'https://pollinations.ai' },
    { name: 'FreeTheAi', detail: '60+ models · OpenAI-compatible · free', url: 'https://freetheai.xyz' },
    { name: 'LocalAI', detail: 'Self-hosted · open-source · $0', url: 'https://localai.io' },
  ];

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <p className={`text-[var(--muted)] ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        No paid API keys? Xroga can use free tiers and open-source models — $0 to launch.
      </p>
      <ul className={`space-y-1 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        {options.map((o) => (
          <li key={o.name} className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="font-semibold text-[var(--foreground)]">{o.name}</span>
            <span className="text-[var(--muted)]">{o.detail}</span>
            {!compact && (
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                Get started
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
