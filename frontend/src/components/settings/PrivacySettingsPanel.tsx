'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { cn } from '@/lib/utils';

function ToggleRow({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[var(--card-border)]/40 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={cn('w-10 h-5 rounded-full shrink-0 relative transition-colors mt-0.5', on ? 'bg-[#006aff]' : 'bg-white/20')}
      >
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', on ? 'left-5' : 'left-0.5')} />
      </button>
    </div>
  );
}

export function PrivacySettingsPanel() {
  const allowPersonalInfo = usePrivacyStore((s) => s.allowPersonalInfo);
  const setAllowPersonalInfo = usePrivacyStore((s) => s.setAllowPersonalInfo);
  const useRandomDisplayName = usePrivacyStore((s) => s.useRandomDisplayName);
  const setUseRandomDisplayName = usePrivacyStore((s) => s.setUseRandomDisplayName);
  const rememberIp = usePrivacyStore((s) => s.rememberIp);
  const setRememberIp = usePrivacyStore((s) => s.setRememberIp);
  const crossProjectAccess = usePrivacyStore((s) => s.crossProjectAccess);
  const setCrossProjectAccess = usePrivacyStore((s) => s.setCrossProjectAccess);
  const xrogaAutoMode = usePrivacyStore((s) => s.xrogaAutoMode);
  const setXrogaAutoMode = usePrivacyStore((s) => s.setXrogaAutoMode);

  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-lg">Privacy & AI behavior</h2>
      <p className="text-xs text-[var(--muted)] leading-relaxed">
        Control how Xroga uses your data. We only use what you allow — never sold or misused.
      </p>
      <div className="rounded-xl border border-[var(--card-border)]/50 divide-y divide-[var(--card-border)]/30 px-4">
        <ToggleRow
          label="Allow personal context"
          desc="Let Xroga use your profile info to personalize replies (never shared externally)."
          on={allowPersonalInfo}
          onChange={setAllowPersonalInfo}
        />
        <ToggleRow
          label="Use random display name"
          desc="Mask your real name in logs and non-essential UI with a random alias."
          on={useRandomDisplayName}
          onChange={setUseRandomDisplayName}
        />
        <ToggleRow
          label="Remember my IP"
          desc="When off, we do not store your IP for analytics or session fingerprinting."
          on={rememberIp}
          onChange={setRememberIp}
        />
        <ToggleRow
          label="Access other projects & chats"
          desc="When off, AI only sees the current chat/project — not your full history."
          on={crossProjectAccess}
          onChange={setCrossProjectAccess}
        />
        <ToggleRow
          label="Xroga Auto mode"
          desc="Let Black Hole V∞ orchestrate all capabilities automatically for your tasks."
          on={xrogaAutoMode}
          onChange={setXrogaAutoMode}
        />
      </div>
    </div>
  );
}

export function UserPromptBubble({ content }: { content: string }) {
  const safe = typeof content === 'string' ? content : '';
  const [expanded, setExpanded] = useState(false);
  const long = safe.length > 120;

  return (
    <div className="inline-block max-w-full text-left">
      <span className="inline-block max-w-full px-3 py-2 rounded-xl bg-gradient-to-br from-[#006aff]/15 to-slate-500/10 border border-[var(--card-border)]/50 shadow-sm">
        <span className="opacity-60 mr-2">&gt;</span>
        <span className={cn(!expanded && long && 'line-clamp-3')}>{safe}</span>
      </span>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 text-[9px] text-[#006aff] mt-1 font-semibold px-3"
        >
          <ChevronDown className={cn('w-3 h-3', expanded && 'rotate-180')} />
          {expanded ? 'Show less' : 'Full prompt'}
        </button>
      )}
      {expanded && long && (
        <div className="mt-1.5 mx-1 px-3 py-2 rounded-lg border border-[var(--card-border)]/40 bg-[var(--background)]/60 text-[11px] text-[var(--foreground)] whitespace-pre-wrap break-words">
          {safe}
        </div>
      )}
    </div>
  );
}
