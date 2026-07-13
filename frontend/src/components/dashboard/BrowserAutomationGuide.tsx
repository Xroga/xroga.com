'use client';

import { Monitor, Shield, Zap, Brain, Globe, Save } from 'lucide-react';

const STEPS = [
  { n: 1, role: 'Task Parsing', desc: 'Converts your request into structured browser steps', cost: '~$0.001' },
  { n: 2, role: 'Page Analysis', desc: 'Identifies forms, buttons, and fields on each page', cost: '~$0.001/page' },
  { n: 3, role: 'Decision Making', desc: 'Handles CAPTCHAs, errors, and unexpected pages', cost: '~$0.002' },
  { n: 4, role: 'Value Generation', desc: 'Fills forms using your stored profile data', cost: '~$0.001' },
  { n: 5, role: 'Local Execution', desc: 'Extension runs all actions on your machine — $0 cost', cost: '$0' },
  { n: 6, role: 'Skill Saving', desc: 'Successful workflows saved for instant reuse', cost: '~$0.0005' },
];

export function BrowserAutomationGuide() {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--accent)]/20">
      <div className="px-5 py-4 border-b border-[var(--card-border)] bg-gradient-to-r from-[var(--accent)]/10 to-transparent">
        <h2 className="font-semibold flex items-center gap-2">
          <Monitor className="w-5 h-5 text-[var(--accent)]" />
          How Browser Automation Works
        </h2>
        <p className="text-xs text-[var(--muted)] mt-1">
          AI plans and analyzes — your local browser executes at zero platform cost. Credentials never leave your machine.
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-white/5 p-3 flex gap-2">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">First run</p>
              <p className="text-[var(--muted)]">~$0.005–$0.01 AI planning</p>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-3 flex gap-2">
            <Save className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Skill reuse</p>
              <p className="text-[var(--muted)]">$0 — instant replay</p>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-3 flex gap-2">
            <Shield className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Privacy</p>
              <p className="text-[var(--muted)]">Data stays on your device</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-3 items-start rounded-xl border border-[var(--card-border)]/60 p-3 hover:border-[var(--accent)]/30 transition-colors">
              <span className="w-6 h-6 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] text-xs font-bold flex items-center justify-center shrink-0">
                {s.n}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{s.role}</span>
                  <span className="text-[10px] text-emerald-400 ml-auto">{s.cost}</span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs">
          <p className="font-semibold text-amber-400 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            CAPTCHA detected?
          </p>
          <p className="text-[var(--muted)] mt-1">
            Automation pauses and asks you to solve it manually in the Xroga browser panel, then click Continue. Your session stays local.
          </p>
        </div>

        <p className="text-[10px] text-[var(--muted)] flex items-center gap-1">
          <Globe className="w-3 h-3" />
          Supported: Chrome, Edge, Firefox · Up to 10 parallel tabs
        </p>
      </div>
    </div>
  );
}
