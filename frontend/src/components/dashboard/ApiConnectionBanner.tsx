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
    fetch(`${API_URL}/health`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((data) => {
        if (data.authConfigured === false) {
          setIssue(
            'API is missing SUPABASE_URL on Fly.io. Chat will show "Authentication failed" until you set the Supabase Project URL (https://xxx.supabase.co) — not the Site URL.'
          );
        }
      })
      .catch(() => {
        setIssue('Cannot reach the API. Check NEXT_PUBLIC_API_URL on Vercel.');
      });
  }, []);

  if (!issue) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex gap-3 text-sm text-amber-100">
      <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
      <p>{issue}</p>
    </div>
  );
}
