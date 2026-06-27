'use client';

import { cn } from '@/lib/utils';

interface RotatingWordsProps {
  prefix: string;
  words: string[];
  className?: string;
  variant?: 'hero' | 'dashboard';
}

export function RotatingWords({ prefix, words, className, variant = 'hero' }: RotatingWordsProps) {
  const loop = words.length > 1 ? [...words, words[0]] : words;

  return (
    <div
      className={cn(
        'xv-rotating-words inline-flex items-center justify-center',
        variant === 'hero' ? 'xv-rotating-words--hero' : 'xv-rotating-words--dashboard',
        className
      )}
      aria-live="polite"
    >
      <span className="xv-rotating-prefix">{prefix}</span>
      <div className="xv-rotating-words-slot" style={{ '--word-count': words.length } as React.CSSProperties}>
        <div className="xv-rotating-words-track">
          {loop.map((word, i) => (
            <span key={`${word}-${i}`} className="xv-rotating-word">
              {word}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
