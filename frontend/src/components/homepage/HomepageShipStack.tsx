'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, CirclePause, CirclePlay, Code2, Eye, FileCode2, Folder, GitCommit, KeyRound, Mic, Paperclip, RefreshCw, Rocket, Send, ShieldCheck, TestTube2 } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';

const STAGES = [
  { id: 'prompt', label: 'Prompt', detail: 'Describe the outcome' },
  { id: 'build', label: 'Build', detail: 'Xroga executes' },
  { id: 'validate', label: 'Validate', detail: 'Checks and repair' },
  { id: 'github', label: 'GitHub', detail: 'Code is pushed' },
  { id: 'preview', label: 'Preview', detail: 'Review the result' },
] as const;

type Stage = (typeof STAGES)[number]['id'];

const PROMPT = 'Build a customer analytics platform with authentication, subscriptions, analytics, and admin controls.';

function PromptScene({ typed }: { typed: number }) {
  return <div className="xv-loop-chat"><header><Image src="/brand/xroga-mark.png" width={28} height={28} alt="Xroga" /><span><b>New product</b><small>Black Hole V∞</small></span></header><div className="xv-loop-chat-space"><p>{PROMPT.slice(0, typed)}<i /></p></div><footer><button type="button" aria-label="Attach files"><Paperclip /></button><button type="button">Integrations <span /></button><button type="button" aria-label="Voice input"><Mic /></button><button type="button" aria-label="Send prompt" className="is-send"><Send /></button></footer></div>;
}

function BuildScene() {
  return <div className="xv-loop-terminal"><header><i /><i /><i /><code>xroga@swarm</code><span>~/workspace</span></header><div><p><b>you</b> {PROMPT}</p><p className="is-done">● planner: Product brief created</p><p className="is-done">● builder: Writing authentication and dashboard files</p><p>● builder: Implementing subscriptions and analytics…</p><p className="is-muted">components/Analytics.tsx · 84 lines</p><span className="xv-loop-terminal-progress"><i /></span></div></div>;
}

function ValidateScene() {
  return <div className="xv-loop-validation"><header><ShieldCheck /><div><small>XROGA / VALIDATION</small><h3>Making “done” mean verified.</h3></div><b>3/4</b></header><ul><li className="is-done"><Code2 /><span><b>TypeScript</b><small>No type errors</small></span><Check /></li><li className="is-done"><TestTube2 /><span><b>Tests</b><small>18 tests passed</small></span><Check /></li><li className="is-done"><ShieldCheck /><span><b>Security</b><small>No exposed secrets</small></span><Check /></li><li className="is-live"><RefreshCw /><span><b>Production build</b><small>Optimizing output…</small></span><i /></li></ul></div>;
}

function GitHubScene() {
  return <div className="xv-loop-repo"><header><Image src="/brand/logos/github.svg" width={24} height={24} alt="GitHub" /><span><b>Xroga / customer-analytics</b><small>private · main</small></span><em>CONNECTED</em></header><div className="xv-loop-repo-body"><ul>{['app','components','lib','tests'].map(file=><li key={file}><Folder /><span>{file}</span><ChevronRight /></li>)}<li><FileCode2 /><span>README.md</span><ChevronRight /></li></ul><div className="xv-loop-commit"><GitCommit /><small>XROGA-GENERATED COMMIT</small><h3>Build customer analytics platform</h3><code>f4c9e21</code><p><Check /> Pushed to your repository</p></div></div></div>;
}

function PreviewScene() {
  return <div className="xv-loop-preview"><nav><button type="button"><Code2 /> Code</button><button type="button" className="is-active"><Eye /> Preview</button><button type="button"><Rocket /> Deploy</button></nav><div className="xv-loop-product"><aside><strong>Pulse</strong>{['Overview','Customers','Revenue','Reports'].map(x=><span key={x}>{x}</span>)}</aside><main><header><span><small>Monthly revenue</small><b>$48,290</b></span><button type="button">Export report</button></header><div className="xv-loop-chart"><i /><i /><i /><i /><i /><i /><i /></div><footer><span><b>1,842</b><small>Active customers</small></span><span><b>12.8%</b><small>Conversion</small></span><span><b>+24%</b><small>Growth</small></span></footer></main></div><p><Check /> Preview generated from verified repository state</p></div>;
}

export function HomepageShipStack() {
  const sectionRef = useRef<HTMLElement>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [entered, setEntered] = useState(false);
  const stage = STAGES[stageIndex].id as Stage;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setEntered(true); setPlaying(true); } }, { threshold: .32 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !entered || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (stageIndex === 0 && typed < PROMPT.length) {
      const typing = window.setTimeout(() => setTyped(value => Math.min(PROMPT.length, value + 2)), 34);
      return () => window.clearTimeout(typing);
    }
    const timer = window.setTimeout(() => setStageIndex(value => (value + 1) % STAGES.length), stageIndex === 0 ? 1100 : 3600);
    return () => window.clearTimeout(timer);
  }, [entered, playing, stageIndex, typed]);

  const selectStage = (index: number) => { setStageIndex(index); if (index === 0) setTyped(PROMPT.length); };
  const replay = () => { setStageIndex(0); setTyped(0); setPlaying(true); };

  return <section ref={sectionRef} className="xv-real-loop" id="ship-loop" aria-labelledby="ship-heading">
    <div className="xv-real-loop__inner">
      <header className="xv-real-loop__heading"><p><i /> THE XROGA SHIP LOOP</p><h2 id="ship-heading">From prompt to <em>ownership.</em></h2><span>Watch one product move through the same visible states: describe, build, verify, push, and preview.</span></header>
      <div className="xv-real-loop__stage" aria-live="polite">
        <div className="xv-real-loop__stagebar"><span><Image src="/brand/xroga-mark.png" width={26} height={26} alt="" /><b>{STAGES[stageIndex].label}</b><small>{STAGES[stageIndex].detail}</small></span><div><button type="button" onClick={()=>setPlaying(value=>!value)} aria-label={playing?'Pause animation':'Play animation'}>{playing?<CirclePause />:<CirclePlay />}</button><button type="button" onClick={replay} aria-label="Replay animation"><RefreshCw /></button></div></div>
        <div className={`xv-real-loop__scene is-${stage}`} key={stage}>{stage==='prompt'&&<PromptScene typed={typed}/>} {stage==='build'&&<BuildScene/>} {stage==='validate'&&<ValidateScene/>} {stage==='github'&&<GitHubScene/>} {stage==='preview'&&<PreviewScene/>}</div>
        <nav className="xv-real-loop__rail" aria-label="Build animation stages">{STAGES.map((item,index)=><button key={item.id} type="button" onClick={()=>selectStage(index)} className={index===stageIndex?'is-active':index<stageIndex?'is-done':''}><i>{index<stageIndex?<Check />:String(index+1).padStart(2,'0')}</i><span><b>{item.label}</b><small>{item.detail}</small></span></button>)}</nav>
      </div>
      <footer className="xv-real-loop__ownership"><span><GitHubIcon /> Your repository</span><span><KeyRound /> Your credentials</span><span><Rocket /> Your deployment</span><b>You own the product.</b></footer>
    </div>
  </section>;
}
