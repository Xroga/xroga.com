'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import { AlertTriangle } from 'lucide-react';

interface HealthResponse {
  authConfigured?: boolean;
  status?: string;
}

export function ApiConnectionBanner() {
  const [issue, setIssue] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    fetch(`${API_URL}/health`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((data) => {
        if (data.authConfigured === false) {
          setIssue('Local API authentication is not configured.');
        }
      })
      .catch(() => {
        setIssue('Local API is unavailable.');
      });
  }, []);

  if (process.env.NODE_ENV !== 'development' || !issue) return null;

  return (
    /* `text-amber-100` is a near-white cream: legible on a dark surface, invisible on a
       light one, so this warning silently disappeared under the light skins. The darker
       amber reads on both. */
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex gap-3 text-sm text-amber-500">
      <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
      <p>{issue}</p>
    </div>
  );
}
