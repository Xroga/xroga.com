'use client';

import {
  ArrowRight,
  ChevronDown,
  Code2,
  Layers3,
  LayoutDashboard,
  Mouse,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from './AiAppBuilderHero.module.css';

const SUGGESTIONS = [
  {
    label: 'SaaS dashboard',

    value:
      'Build a SaaS analytics dashboard with authentication, teams, billing, charts, and a PostgreSQL-backed API.',

    icon: LayoutDashboard,
  },

  {
    label: 'Marketplace',

    value:
      'Build a modern marketplace with accounts, listings, search, seller profiles, checkout, and an admin dashboard.',

    icon: ShoppingBag,
  },

  {
    label: 'Internal tool',

    value:
      'Build an internal operations tool with authentication, role-based access, forms, tables, workflows, and reporting.',

    icon: Layers3,
  },

  {
    label: 'API-backed app',

    value:
      'Build a polished web application connected to a secure API, persistent database, authentication, and responsive dashboard.',

    icon: Code2,
  },
] as const;

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
      <p className={styles.heroSubtitle}>
        Turn ideas into real, working software with AI.
        Plan, build, test, and deploy full-stack
        applications inside a repository you own.
      </p>

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

      <div
        className={styles.suggestions}
        aria-label="Example app ideas"
      >
        {SUGGESTIONS.map((suggestion) => {
          const Icon =
            suggestion.icon;

          const selected =
            value === suggestion.value;

          return (
            <button
              key={suggestion.label}
              type="button"
              className={styles.suggestion}
              data-selected={selected}
              aria-pressed={selected}
              onClick={() =>
                setValue(suggestion.value)
              }
            >
              <Icon aria-hidden="true" />

              <span>
                {suggestion.label}
              </span>
            </button>
          );
        })}
      </div>

      <a
        href="#xab-platform-heading"
        className={styles.scrollCue}
        aria-label="Scroll to explore the AI App Builder"
      >
        <Mouse
          className={styles.mouseIcon}
          aria-hidden="true"
        />

        <span>
          Scroll to explore
        </span>

        <ChevronDown
          className={styles.chevron}
          aria-hidden="true"
        />
      </a>
    </div>
  );
}
