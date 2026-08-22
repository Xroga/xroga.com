'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';

/**
 * The hero prompt card.
 *
 * A real control, not a decorative shape: typing and submitting carries the draft to
 * signup, where the build actually starts. It deliberately does *not* pretend to run a
 * build on a marketing page — that would be a fake product surface.
 *
 * The chips name only categories the capability data already claims support for:
 * "web products, SaaS applications, dashboards, API-backed tools".
 */
const CHIPS = ['SaaS dashboard', 'Marketplace', 'Internal tool', 'API-backed app'] as const;

export function AiAppBuilderPrompt() {
  const router = useRouter();
  const [value, setValue] = useState('');

  const start = () => {
    const draft = value.trim();
    router.push(draft ? `/auth/signup?intent=${encodeURIComponent(draft)}` : '/auth/signup');
  };

  return (
    <form
      className="xab-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <label className="sr-only" htmlFor="xab-prompt-field">
        Describe the app you want to build
      </label>
      <textarea
        id="xab-prompt-field"
        className="xab-prompt__field"
        placeholder="Describe the app you want to build..."
        value={value}
        rows={2}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            start();
          }
        }}
      />

      <div className="xab-prompt__row">
        <div className="xab-chips">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="xab-chip"
              aria-pressed={value === chip}
              onClick={() => setValue(chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        <button type="submit" className="xab-prompt__send" aria-label="Start building">
          <ArrowUp aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
