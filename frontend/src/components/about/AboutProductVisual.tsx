'use client';

import Image from 'next/image';
import { Check, CircleDot, Code2, FileCode2, GitBranch, Rocket, ShieldCheck } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { cn } from '@/lib/utils';

type VisualVariant = 'hero' | 'workflow' | 'verify';

const FLOW = [
  { label: 'Describe', Icon: CircleDot },
  { label: 'Build', Icon: Code2 },
  { label: 'Verify', Icon: ShieldCheck },
] as const;

export function AboutProductVisual({ variant, className }: { variant: VisualVariant; className?: string }) {
  if (variant === 'hero') {
    return (
      <div className={cn('ab-product-visual is-hero', className)} aria-label="Xroga product build running from prompt to verified repository">
        <div className="ab-pv-glow" aria-hidden />
        <header className="ab-pv-windowbar"><i /><i /><i /><span>workspace / live run</span><b><i /> ONLINE</b></header>
        <div className="ab-pv-hero-body">
          <div className="ab-pv-command"><span>YOU</span><p>Build a customer portal and ship it.</p></div>
          <div className="ab-pv-agent">
            <Image src="/brand/xroga-mark.png" width={28} height={28} alt="" />
            <div><span>XROGA / BUILD 0841</span><strong>Implementing the product loop</strong></div>
            <b>RUNNING <i /></b>
          </div>
          <ol className="ab-pv-events">
            <li><Check /> Repository understood <small>complete</small></li>
            <li><FileCode2 /> Components generated <small>12 files</small></li>
            <li className="is-active"><ShieldCheck /> Validating changes <small>in progress</small></li>
          </ol>
          <div className="ab-pv-proof"><GitHubIcon /><span><b>Your GitHub</b><small>Sticky repository</small></span><GitBranch /><span><b>Verified change</b><small>Evidence attached</small></span></div>
        </div>
      </div>
    );
  }

  if (variant === 'workflow') {
    return (
      <div className={cn('ab-product-visual is-workflow', className)} aria-label="Three connected Xroga workflow steps">
        <header><span>CONNECTED WORKFLOW</span><b><i /> LIVE</b></header>
        <div className="ab-pv-flowline" aria-hidden><i /><i /><i /></div>
        <ol className="ab-pv-flow">
          {FLOW.map(({ label, Icon }, index) => (
            <li key={label} className={index === 1 ? 'is-active' : undefined}>
              <span><Icon /></span><small>0{index + 1}</small><strong>{label}</strong>
              <p>{index === 0 ? 'Outcome captured' : index === 1 ? 'Focused code changes' : 'Checks and evidence'}</p>
            </li>
          ))}
        </ol>
        <footer><Image src="/brand/xroga-mark.png" width={24} height={24} alt="" /><span><b>One prompt. One repository.</b><small>The loop keeps its context.</small></span></footer>
      </div>
    );
  }

  return (
    <div className={cn('ab-product-visual is-verify', className)} aria-label="Verified Xroga build evidence panel">
      <header><span>XROGA / RELEASE PROOF</span><b>ALL CHECKS PASSED <Check /></b></header>
      <div className="ab-pv-release">
        <div><small>BUILD 0841</small><h3>Customer portal is ready.</h3><p>Changed files, automated checks, repository commit, and deployment evidence stay together.</p></div>
        <span className="ab-pv-score"><b>4/4</b><small>verified</small></span>
      </div>
      <div className="ab-pv-checks">
        {['TypeScript', 'Tests', 'GitHub push', 'Preview'].map((item, index) => <span key={item}><Check /><b>{item}</b><small>{index < 2 ? 'Passed' : 'Confirmed'}</small></span>)}
      </div>
      <footer><Rocket /><span><b>Ready for your authorization</b><small>Xroga reports “live” only when provider evidence exists.</small></span></footer>
    </div>
  );
}
