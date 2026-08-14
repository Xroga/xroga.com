'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Captions, Check, ChevronDown, Clapperboard, FileText, Film, Image as ImageIcon,
  Layers3, Menu, Mic2, Moon, PlaySquare, Ratio, Send, Sparkles, Sun, WandSparkles, X,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

const FEATURES = [
  [FileText, 'Text to Video', 'Turn a clear prompt into a structured visual sequence.'],
  [ImageIcon, 'Image to Video', 'Give still images movement, pace, and cinematic continuity.'],
  [Clapperboard, 'Script to Video', 'Transform a script into planned scenes, voice, and captions.'],
  [Layers3, 'Reference to Video', 'Carry visual direction across a consistent sequence.'],
  [PlaySquare, 'Shorts & Reels', 'Create focused vertical stories for fast-moving channels.'],
  [Film, 'Long-form Video', 'Plan complete narratives with chapters, scenes, and continuity.'],
] as const;
const WORKFLOW = ['Enter your idea', 'Xroga plans the video', 'Generate scenes', 'Add voice and subtitles', 'Edit and refine', 'Export and publish'];
const USE_CASES = ['YouTube Videos', 'Shorts', 'Reels', 'Ads', 'Explainers', 'Storytelling', 'Product Videos', 'Social Content'];
const FAQS = [
  ['Is Xroga Video available now?', 'Not yet. Xroga Video is in active development, and this page is an honest product preview for early-access interest.'],
  ['What inputs will it support?', 'The planned creation paths include prompts, images, scripts, and visual references.'],
  ['Is it only for short videos?', 'No. The product direction covers short-form social content and structured long-form video workflows.'],
  ['Will beginners be able to use it?', 'That is the goal: a guided workflow that remains clear for beginners while giving creators useful control.'],
] as const;

export function VideoLandingPage() {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeInput, setActiveInput] = useState(0);
  const [activeUseCase, setActiveUseCase] = useState(0);

  return (
    <main className={`xv-video ${dark ? 'is-dark' : 'is-light'}`}>
      <header className="xv-video-nav">
        <a href="#top" className="xv-video-lockup" aria-label="Xroga Video home"><Logo href={null} variant="homepage" height={38} /><i /><strong>Video</strong></a>
        <nav className={menuOpen ? 'is-open' : ''} aria-label="Xroga Video navigation">
          <a href="#features">Features</a><a href="#workflow">Workflow</a><a href="#preview">Preview</a><a href="#use-cases">Use Cases</a><a href="#faq">FAQ</a>
        </nav>
        <div className="xv-video-nav-actions">
          <button type="button" className="xv-video-theme" onClick={() => setDark(value => !value)} aria-label={dark ? 'Use light mode' : 'Use dark mode'}>{dark ? <Sun /> : <Moon />}</button>
          <Link href="/auth/signup" className="xv-video-button xv-video-button--primary">Join Early Access <ArrowRight /></Link>
          <button type="button" className="xv-video-menu" onClick={() => setMenuOpen(value => !value)} aria-label="Toggle menu" aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <section className="xv-video-hero" id="top">
        <div className="xv-video-ambient" aria-hidden="true"><i /><i /><i /></div>
        <div className="xv-video-hero-copy">
          <span className="xv-video-badge"><i /> COMING SOON · AI VIDEO CREATION</span>
          <h1>Turn one idea into<br />a <em>finished video.</em></h1>
          <p>Xroga Video is the upcoming AI platform designed to help creators generate, shape, and scale videos from prompt to publish.</p>
          <div><Link href="/auth/signup" className="xv-video-button xv-video-button--primary">Join Early Access <ArrowRight /></Link><a href="#workflow" className="xv-video-button">Explore the Workflow</a></div>
          <ul><li><Check /> Prompt to video</li><li><Check /> Creator workflow</li><li><Check /> Short + long form</li></ul>
        </div>

        <div className="xv-video-product" aria-label="Xroga Video interface preview">
          <div className="xv-video-product-bar"><span><i /><i /><i /></span><b>CREATION / NEW PROJECT</b><small>PREVIEW</small></div>
          <div className="xv-video-product-body">
            <aside><span className="is-active"><Sparkles /> Create</span><span><Layers3 /> Projects</span><span><Clapperboard /> Scenes</span><span><Captions /> Captions</span></aside>
            <div className="xv-video-creator">
              <div className="xv-video-canvas"><div className="xv-video-canvas-orb"><span /><i /></div><small>SCENE 04 · CINEMATIC</small><strong>A world waiting<br />to be imagined.</strong></div>
              <div className="xv-video-prompt"><div><Sparkles /><span><small>VIDEO PROMPT</small><b>A lone explorer discovers a luminous city above the clouds.</b></span></div><button type="button" aria-label="Preview prompt submission"><ArrowRight /></button></div>
              <div className="xv-video-controls"><span><Ratio /> 16:9</span><span><Film /> Cinematic</span><span><Mic2 /> Voice</span><b>GENERATE PREVIEW</b></div>
            </div>
          </div>
          <div className="xv-video-timeline" aria-hidden="true">{[1,2,3,4,5,6].map(item => <span key={item} className={item === 4 ? 'is-active' : ''}><i /></span>)}</div>
        </div>
      </section>

      <section className="xv-video-section" id="features" aria-labelledby="video-features">
        <div className="xv-video-section-head"><span>WHAT XROGA VIDEO DOES</span><h2 id="video-features">Every way an idea<br /><em>becomes motion.</em></h2><p>One guided creative system for different inputs, formats, and publishing goals.</p></div>
        <div className="xv-video-feature-grid">{FEATURES.map(([Icon,title,body], index) => <article key={title}><span>0{index+1}</span><Icon /><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className="xv-video-workflow" id="workflow" aria-labelledby="video-workflow">
        <div className="xv-video-section-head"><span>THE CREATOR LOOP</span><h2 id="video-workflow">From first thought<br /><em>to final frame.</em></h2></div>
        <ol>{WORKFLOW.map((step,index) => <li key={step}><b>{String(index+1).padStart(2,'0')}</b><span>{step}</span>{index < WORKFLOW.length-1 ? <i /> : null}</li>)}</ol>
      </section>

      <section className="xv-video-section xv-video-preview" id="preview" aria-labelledby="video-preview">
        <div className="xv-video-section-head"><span>PRODUCT PREVIEW</span><h2 id="video-preview">A studio that starts<br /><em>with plain language.</em></h2><p>Explore a guided preview of the planned creation flow. Live generation is not available yet.</p></div>
        <div className="xv-video-studio">
          <div className="xv-video-studio-tabs">{['Prompt','Scenes','Timeline','Export'].map((tab,index)=><button type="button" key={tab} className={activeInput===index?'is-active':''} onClick={()=>setActiveInput(index)}><span>0{index+1}</span>{tab}</button>)}</div>
          <div className="xv-video-studio-main">
            <div className="xv-video-scene-list"><b>PROJECT SCENES</b>{['The signal','Above the clouds','A hidden city','First contact'].map((scene,index)=><button type="button" key={scene} className={index===activeInput?'is-active':''} onClick={()=>setActiveInput(index)}><i>{index+1}</i><span><strong>{scene}</strong><small>Scene 0{index+1} · {index===activeInput?'Selected':'Ready'}</small></span></button>)}</div>
            <div className="xv-video-stage"><span>PREVIEW ONLY</span><div><i /><i /><i /></div><strong>{['Describe the visual story','Arrange every scene','Refine timing and audio','Package the final project'][activeInput]}</strong><p>{['Start with a prompt, script, image, or visual reference.','Keep characters, settings, and intent connected.','Shape pacing, captions, voice, and transitions.','Prepare formats for the channels where you publish.'][activeInput]}</p></div>
            <div className="xv-video-inspector"><b>PROJECT SETTINGS</b><label>Format<span>Auto <ChevronDown /></span></label><label>Ratio<span>16:9 <ChevronDown /></span></label><label>Style<span>Cinematic <ChevronDown /></span></label><label>Captions<span>Enabled <Check /></span></label></div>
          </div>
          <div className="xv-video-editor"><span><b>00:00</b><i /></span>{[1,2,3,4,5].map(item=><div key={item}><i /><i /><i /></div>)}</div>
        </div>
      </section>

      <section className="xv-video-usecases" id="use-cases" aria-labelledby="video-use-cases">
        <div className="xv-video-section-head"><span>MADE FOR THE WORK</span><h2 id="video-use-cases">One system.<br /><em>Every format.</em></h2></div>
        <div className="xv-video-usecase-layout"><div>{USE_CASES.map((item,index)=><button type="button" key={item} className={activeUseCase===index?'is-active':''} onClick={()=>setActiveUseCase(index)}><span>{String(index+1).padStart(2,'0')}</span>{item}<ArrowRight /></button>)}</div><article><small>SELECTED USE CASE</small><strong>{USE_CASES[activeUseCase]}</strong><p>Plan the idea, create scenes, refine the edit, add captions, and prepare the right output—inside one future creator workflow.</p><div><WandSparkles /><span>AI-assisted structure</span></div><div><Captions /><span>Captions and voice</span></div><div><Send /><span>Publish-ready formats</span></div></article></div>
      </section>

      <section className="xv-video-soon" aria-labelledby="video-soon"><span>COMING SOON</span><h2 id="video-soon">Be first to explore<br /><em>the future of creation.</em></h2><p>Xroga Video is currently in development. Join early access to be first to explore the future of AI video creation.</p><form action="/auth/signup" method="get"><label><span className="sr-only">Email address</span><input type="email" name="email" required placeholder="Enter your email address" /></label><button className="xv-video-button xv-video-button--primary" type="submit">Get Notified <ArrowRight /></button></form></section>

      <section className="xv-video-section xv-video-faq" id="faq" aria-labelledby="video-faq"><div className="xv-video-section-head"><span>FAQ</span><h2 id="video-faq">Clear now.<br /><em>More at launch.</em></h2></div><div>{FAQS.map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>

      <section className="xv-video-final"><div className="xv-video-lockup xv-video-lockup--large"><Logo href={null} variant="homepage" height={54} /><i /><strong>Video</strong></div><h2>Be first to experience Xroga Video.</h2><div><Link href="/auth/signup" className="xv-video-button xv-video-button--primary">Join Early Access <ArrowRight /></Link><Link href="/contact" className="xv-video-button">Contact Us</Link></div></section>
      <footer className="xv-video-footer"><span>© 2026 XROGA AI</span><span>AI video creation, from prompt to publish.</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/">Xroga AI</Link></div></footer>
    </main>
  );
}
