'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface RotatingWordsProps {
  prefix: string;
  words: string[];
  className?: string;
  variant?: 'hero' | 'dashboard';
  /** Stop animation after N ms and freeze on first word */
  stopAfterMs?: number;
}

export function RotatingWords({
  prefix,
  words,
  className,
  variant = 'hero',
  stopAfterMs,
}: RotatingWordsProps) {
  const [frozen, setFrozen] = useState(false);
  const loop = words.length > 1 ? [...words, words[0]] : words;
  const displayWord = frozen ? words[0] : null;

  useEffect(() => {
    if (!stopAfterMs) return;
    const t = setTimeout(() => setFrozen(true), stopAfterMs);
    return () => clearTimeout(t);
  }, [stopAfterMs]);

  return (
    <div
      className={cn(
        'xv-rotating-words inline-flex items-center justify-center',
        variant === 'hero' ? 'xv-rotating-words--hero' : 'xv-rotating-words--dashboard',
        frozen && 'xv-rotating-words--frozen',
        className
      )}
      aria-live="polite"
    >
      <span className="xv-rotating-prefix">{prefix}</span>
      {frozen && displayWord ? (
        <span className="xv-rotating-word xv-rotating-word--static">{displayWord}</span>
      ) : (
        <div className="xv-rotating-words-slot" style={{ '--word-count': words.length } as React.CSSProperties}>
          <div className="xv-rotating-words-track">
            {loop.map((word, i) => (
              <span key={`${word}-${i}`} className="xv-rotating-word">
                {word}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
