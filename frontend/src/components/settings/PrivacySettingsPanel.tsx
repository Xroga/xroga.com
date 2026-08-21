'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { SettingsPanelHeader, SettingsRow, SettingsStack } from '@/components/settings/SettingsPrimitives';

export function PrivacySettingsPanel() {
  const allowPersonalInfo = usePrivacyStore((s) => s.allowPersonalInfo);
  const setAllowPersonalInfo = usePrivacyStore((s) => s.setAllowPersonalInfo);
  const useRandomDisplayName = usePrivacyStore((s) => s.useRandomDisplayName);
  const setUseRandomDisplayName = usePrivacyStore((s) => s.setUseRandomDisplayName);
  const rememberIp = usePrivacyStore((s) => s.rememberIp);
  const setRememberIp = usePrivacyStore((s) => s.setRememberIp);
  const crossProjectAccess = usePrivacyStore((s) => s.crossProjectAccess);
  const setCrossProjectAccess = usePrivacyStore((s) => s.setCrossProjectAccess);
  return (
    <SettingsStack>
      <SettingsPanelHeader
        title="Privacy & AI behavior"
        description="Control how Xroga uses your data. We only use what you allow — never sold or misused. These preferences are stored on this device."
      />
      <div>
        <SettingsRow>
          <Switch
            checked={allowPersonalInfo}
            onChange={setAllowPersonalInfo}
            label="Allow personal context"
            description="Let Xroga use your profile info to personalize replies (never shared externally)."
          />
        </SettingsRow>
        <SettingsRow>
          <Switch
            checked={useRandomDisplayName}
            onChange={setUseRandomDisplayName}
            label="Use random display name"
            description="Mask your real name in logs and non-essential UI with a random alias."
          />
        </SettingsRow>
        <SettingsRow>
          <Switch
            checked={rememberIp}
            onChange={setRememberIp}
            label="Remember my IP"
            description="When off, we do not store your IP for analytics or session fingerprinting."
          />
        </SettingsRow>
        <SettingsRow>
          <Switch
            checked={crossProjectAccess}
            onChange={setCrossProjectAccess}
            label="Access other projects & chats"
            description="When off, AI only sees the current chat/project — not your full history."
          />
        </SettingsRow>
        <SettingsRow className="flex items-start justify-between gap-4">
          <div className="min-w-0 py-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Safety confirmations</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
              Xroga may continue safe, reversible work automatically. Destructive or production-impacting actions still require explicit approval.
            </p>
          </div>
          <Badge tone="neutral" className="mt-3 shrink-0">
            Required
          </Badge>
        </SettingsRow>
      </div>
    </SettingsStack>
  );
}

export function UserPromptBubble({ content }: { content: string }) {
  const safe = typeof content === 'string' ? content : '';
  const [expanded, setExpanded] = useState(false);
  const long = safe.length > 120;

  return (
    <div className="inline-block max-w-full text-left">
      <span className="xv-user-bubble">
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
