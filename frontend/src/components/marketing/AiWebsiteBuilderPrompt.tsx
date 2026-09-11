'use client';

import { ArrowUp, Link2, Paperclip } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const QUICK_STARTS = [
  'Portfolio',
  'SaaS landing page',
  'Dashboard',
  'Marketing site',
];

export function AiWebsiteBuilderPrompt() {
  const router = useRouter();
  const [value, setValue] = useState('');

  function start() {
    const draft = value.trim();

    router.push(
      draft
        ? `/auth/signup?intent=${encodeURIComponent(draft)}`
        : '/auth/signup',
    );
  }

  return (
    <div className="xwb-prompt-wrap">
      <form
        className="xwb-prompt"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <label htmlFor="xwb-prompt-field" className="xwb-sr-only">
          Describe the website you want to build
        </label>

        <textarea
          id="xwb-prompt-field"
          value={value}
          rows={2}
          placeholder="Describe the website you want to build..."
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              start();
            }
          }}
        />

        <div className="xwb-prompt__bar">
          <div className="xwb-prompt__tools" aria-hidden="true">
            <span><Paperclip /></span>
            <span><Link2 /></span>
            <i>Public</i>
          </div>

          <button type="submit" aria-label="Start building">
            <ArrowUp />
          </button>
        </div>
      </form>

      <div className="xwb-quick-starts" aria-label="Example website ideas">
        {QUICK_STARTS.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setValue(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
