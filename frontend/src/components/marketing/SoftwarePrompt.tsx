'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';

/**
 * The hero prompt panel — real HTML, deliberately not baked into the artwork.
 *
 * It carries the draft to signup, where the build actually starts; it does not
 * pretend to run a build on a marketing page. Chips name only software categories
 * Xroga's own capability copy claims support for.
 */
const CHIPS = ['SaaS product', 'Internal tool', 'Dashboard', 'API service'] as const;

export function SoftwarePrompt() {
  const router = useRouter();
  const [value, setValue] = useState('');

  const start = () => {
    const draft = value.trim();
    router.push(draft ? `/auth/signup?intent=${encodeURIComponent(draft)}` : '/auth/signup');
  };

  return (
    <form
      className="xsw-prompt"
      onSubmit={(e) => { e.preventDefault(); start(); }}
    >
      <label className="sr-only" htmlFor="xsw-prompt-field">Describe the software you want to build</label>
      <textarea
        id="xsw-prompt-field"
        className="xsw-prompt__field"
        placeholder="Describe the software you want to build..."
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); }
        }}
      />
      <div className="xsw-prompt__row">
        <div className="xsw-chips">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="xsw-chip"
              aria-pressed={value === chip}
              onClick={() => setValue(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <button type="submit" className="xsw-send" aria-label="Start building">
          <ArrowUp aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
