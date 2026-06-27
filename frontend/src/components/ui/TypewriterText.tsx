'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TypewriterTextProps {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
}

export function TypewriterText({ text, className, speed = 28, delay = 0 }: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    setDisplayed('');
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed, started]);

  return (
    <span className={cn(className)}>
      {displayed}
      {started && displayed.length < text.length && (
        <span className="inline-block w-[2px] h-[0.9em] bg-[var(--accent)] ml-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
}
