'use client';

import * as Lucide from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Keep the complete icon catalog in this lazy chunk, not the shared app bundle.
// The installed Lucide package supplies every icon rather than a fixed shortlist.
function iconExportName(name: string): string | null {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) return null;
  return name.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

export function XrogaLucideIcon({ name, fallback: Fallback }: { name: string; fallback: LucideIcon }) {
  const exportName = iconExportName(name);
  const Candidate = exportName ? Lucide[exportName as keyof typeof Lucide] : undefined;
  const Icon = Candidate && typeof Candidate === 'object' && 'displayName' in Candidate && typeof Candidate.displayName === 'string'
    ? Candidate as unknown as LucideIcon
    : Fallback;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}
