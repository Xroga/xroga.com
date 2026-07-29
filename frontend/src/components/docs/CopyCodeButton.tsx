'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
export function CopyCodeButton({ value }: { value: string }) { const [copied, setCopied] = useState(false); return <button type="button" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }} className="absolute right-2 top-2 rounded-lg border border-white/15 bg-white/10 p-2 text-white" aria-label="Copy code">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>; }
