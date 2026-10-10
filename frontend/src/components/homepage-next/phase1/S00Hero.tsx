'use client';

/**
 * S00, the hero. Left: what Xroga is producing. Centre: the exact Xroga orb. Right: the context for the
 * job (tools, research sources or a cleanup plan). Bottom: a working command bar. Seven serious jobs in one
 * continuous loop, no visible chapter names.
 */
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Capability } from './Capability';
import { CommandBar } from './CommandBar';
import { COMMANDS_MOBILE, COPY } from './copy';
import type { BgBeat } from './orchestration';
import { Stage, type StageMode } from './Stage';
import { reviewParam, useOrchestration } from './useOrchestration';
import s from './S00Hero.module.css';
// the homepage header restyled to belong to this hero (homepage-scoped, see the file header)
import './s00-header.css';

const TITLE = [COPY.title.slice(0, COPY.title.lastIndexOf(' ')), COPY.title.slice(COPY.title.lastIndexOf(' ') + 1)] as const;

const XrogaSlats = dynamic(() => import('./XrogaSlats'), { ssr: false });

function useMode(): StageMode {
  const [mode, setMode] = useState<StageMode>('desk');
  useEffect(() => {
    const m = () => setMode(window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1000 ? 'tablet' : 'desk');
    m();
    window.addEventListener('resize', m);
    return () => window.removeEventListener('resize', m);
  }, []);
  return mode;
}

/** Where the slat light well sits for each stage event (V7 §42, V8 §46): fractions of the hero. */
const SPOT: Record<BgBeat, [number, number, number]> = {
  calm: [0.5, 0.5, 1], // baseline React Bits field: the event light is effectively off
  compress: [0.5, 0.48, 260], // intent: the field concentrates toward Xroga
  create: [0.3, 0.5, 380], // work object forms: the left field opens
  wave: [0.72, 0.5, 340], // tool call: a brief glint on the right
  verify: [0.5, 0.5, 300], // verification: a soft pulse behind the orb
  publish: [0.16, 0.52, 340], // release: a wave toward the output
};

/** Spectral reflection from the orb (V12 §21): which colour the nearby crest catches, and how much. */
const TINT: Record<BgBeat, [string, number]> = {
  calm: ['#98B4C8', 0],
  compress: ['#C8C0B2', 0.12], // intent gathers: warm metal
  create: ['#B4A8E0', 0.22], // the result forms: a trace of the orb's violet
  wave: ['#98B4C8', 0.3], // a call leaves Xroga: cool blue-white
  verify: ['#BFE3EE', 0.28], // verification: one ice crest
  publish: ['#F2EEE6', 0.18], // release: warm pearl
};

export function S00Hero() {
  const root = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLFormElement>(null);
  // Read the motion preference after mount: the server can't know it, so the first client render must match.
  const prefersReduced = useReducedMotion();
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(!!prefersReduced), [prefersReduced]);
  const mode = useMode();
  const { frame, playing } = useOrchestration(root, reduced);
  // Static CSS slats instead of WebGL when the device can't hold the frame budget. Review only (see
  // reviewParam): ?bg=off for profiling, ?bg=gl keeps WebGL on GPU-less capture machines.
  const [bgOff, setBgOff] = useState(false);
  const [bgForce, setBgForce] = useState(false);
  useEffect(() => {
    const bg = reviewParam('bg');
    setBgOff(bg === 'off');
    setBgForce(bg === 'gl');
  }, []);
  const [sx, sy, sr] = mode === 'desk' ? SPOT[frame.bg] : [0.5, 0.42, mode === 'mobile' ? 220 : 340];

  return (
    <section
      ref={root}
      className={s.hero}
      aria-labelledby="s00-title"
      data-clock={reduced ? 'static' : playing ? 'playing' : 'paused'}
      data-bg={frame.bg}
    >
      <div className={s.bg} aria-hidden="true">
        <div className={s.fallback} />
        {!reduced && !bgOff && (
          <div className={s.slats}>
            <XrogaSlats
              // V12 §17–§20: the founder's React Bits "swell" profile in black titanium and warm metal
              preset="swell"
              color="#2C3037"
              crestColor="#626A72"
              glintColor="#F2EEE6"
              backgroundColor="#050506"
              slatWidth={10}
              slatHeight={25}
              gap={3}
              roundness={0.75}
              cursorStrength={1}
              cursorSize={40}
              swirl={0}
              trail={1.4}
              lean={0}
              scale={1.5}
              speed={0.6}
              direction={250}
              chop={0.55}
              stretch={0}
              glint={0.7}
              contrast={1.25}
              perspective={0.55}
              fog={0.55}
              introDuration={1.5}
              spotLift={0.28}
              spotX={sx}
              spotY={sy}
              spotRadius={sr}
              spotTint={TINT[frame.bg][0]}
              spotTintAmt={mode === 'desk' ? TINT[frame.bg][1] : 0}
              onLowPerf={() => !bgForce && setBgOff(true)}
            />
          </div>
        )}
        <div className={s.eventLight} />
        <div className={s.vignette} />
      </div>

      <div className={s.inner}>
        <header className={s.copy}>
          <div className={s.titleWrap}>
            <h1 id="s00-title" className={s.title}>
              {/* one line on desktop; phones break after "for" (V12 §4) */}
              <span>{TITLE[0]}</span> <span>{TITLE[1]}</span>
            </h1>
            {/* the single H1 shine: a narrow band of light crosses the finished line about every 5 s; the
                base text underneath never changes, and reduced motion renders none of this */}
            {!reduced && (
              <span className={`${s.title} ${s.shine}`} aria-hidden="true">
                <span>{TITLE[0]}</span> <span>{TITLE[1]}</span>
              </span>
            )}
          </div>
          <Capability
            phrase={frame.phrase}
            prevPhrase={frame.prevPhrase}
            mobile={mode === 'mobile'}
            reduced={reduced}
          />
        </header>

        <div className={s.stageWrap}>
          <Stage frame={frame} mode={mode} reduced={reduced} barRef={barRef} />
        </div>

        <div className={s.action} data-in={frame.barIn || undefined}>
          <CommandBar request={reduced ? null : mode === 'mobile' ? (frame.vignette ? COMMANDS_MOBILE[frame.vignette] : null) : frame.prompt} pulse={frame.intent !== null} barRef={barRef} />
        </div>
      </div>
    </section>
  );
}
