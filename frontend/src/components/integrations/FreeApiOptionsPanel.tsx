'use client';

/** Shown when users hesitate to provide paid API keys — free alternatives. */
export function FreeApiOptionsPanel({ compact }: { compact?: boolean }) {
  const options = [
    { name: 'Google Gemini', detail: 'Generous free developer tier', url: 'https://aistudio.google.com' },
    { name: 'Pollinations', detail: 'Text + images · no API key required', url: 'https://pollinations.ai' },
    { name: 'FreeTheAi', detail: 'OpenAI-compatible free models', url: 'https://freetheai.xyz' },
    { name: 'LocalAI', detail: 'Self-hosted · open-source · $0', url: 'https://localai.io' },
  ];

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <p className={`text-[var(--muted)] ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        Legacy DeepSeek / Claude / Grok / Groq options are retired. Use the free options below until
        the new AI system ships.
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
