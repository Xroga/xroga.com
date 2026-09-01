'use client';

import {
  ArrowRight,
  Sparkles,
} from 'lucide-react';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from './AiAppBuilderHero.module.css';

export function AiAppBuilderPrompt() {
  const router = useRouter();

  const [value, setValue] =
    useState('');

  function start() {
    const draft =
      value.trim();

    router.push(
      draft
        ? `/auth/signup?intent=${encodeURIComponent(
            draft
          )}`
        : '/auth/signup'
    );
  }

  return (
    <div className={styles.heroPromptBlock}>
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <div className={styles.inputRow}>
          <span
            className={styles.sparkle}
            aria-hidden="true"
          >
            <Sparkles />
          </span>

          <label
            htmlFor="xab-prompt-field"
            className={styles.srOnly}
          >
            Describe the app you want to build
          </label>

          <textarea
            id="xab-prompt-field"
            className={styles.promptField}
            placeholder="Describe the app you want to build..."
            value={value}
            rows={1}
            onChange={(event) =>
              setValue(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault();
                start();
              }
            }}
          />

          <button
            type="submit"
            className={styles.sendButton}
            aria-label="Start building"
          >
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
