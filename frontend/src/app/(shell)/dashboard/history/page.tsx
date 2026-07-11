'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirect legacy Terminal History route into My Projects */
export default function HistoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/projects?tab=conversations');
  }, [router]);
  return null;
}
