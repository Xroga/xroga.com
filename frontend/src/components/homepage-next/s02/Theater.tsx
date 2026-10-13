'use client';

/**
 * The S02 work theater (V7): one premium Xroga computer window that hosts whichever browser mission or AI Employee
 * is selected. The shell (chrome, X badge, address, status), the pointer, the attached callout, the camera push-in
 * and the result layer are shared; the app inside is different for every scene (Apps.tsx). Everything renders from
 * the current step of one track.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { EMPLOYEES, employeeOf, missionOf, stepsOf, type Result, type TrackId } from './script';
import { Pointer, type Tint } from './motion';
import { XMark } from './XMark';
import { AppView, type Ctx } from './Apps';
import { inertIf } from './inert';
import t from './Theater.module.css';

export function Theater({ track, step, running, reduced, onReplay }: { track: TrackId; step: number; running: boolean; reduced: boolean; onReplay: () => void }) {
  const mission = missionOf(track);
  const employee = employeeOf(track);
  const steps = stepsOf(track);
  const cur = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  const ctx: Ctx = {
    track,
    cur,
    running,
    reduced,
    reached: (id) => {
      const i = steps.findIndex((x) => x.stepId === id);
      return i !== -1 && i <= step;
    },
    isNow: (id) => cur.stepId === id,
  };
  const result: Result = (mission?.result ?? employee?.deliverable)!;
  const [showWork, setShowWork] = useState(false);
  useEffect(() => setShowWork(false), [track]);

  // notes stay attached to the element they are about, from the step that found them onwards
  const notes = steps.slice(0, step + 1).filter((x) => x.note).map((x) => x.note!);
  const note = !last ? (cur.note ?? null) : null;

  // camera: a gentle push-in toward the element being worked on
  const viewport = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState('50% 50%');
  useLayoutEffect(() => {
    const vp = viewport.current;
    const el = cur.target ? (vp?.querySelector(`[data-t="${cur.target}"]`) as HTMLElement | null) : null;
    if (!vp || !el) return;
    const r = el.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    setOrigin(`${(((r.left + r.width / 2 - v.left) / v.width) * 100).toFixed(1)}% ${(((r.top + r.height / 2 - v.top) / v.height) * 100).toFixed(1)}%`);
  }, [track, cur.stepId, cur.target]);

  const operating = !last && cur.action !== 'none';
  const tint: Tint = employee ? employee.id : 'xroga';
  const url = mission ? mission.url(cur.screen) : `${employee!.app}`;

  return (
    <div className={t.theater} data-kind={mission ? 'browser' : 'employee'} data-id={employee?.id ?? mission?.id}>
      <div className={t.window} key={track}>
        <div className={t.chrome}>
          {employee ? (
            <span className={t.who}>
              <span className={t.whoX}><XMark id={employee.id} size={40} state={last ? (employee.deliverable.state === 'approval' ? 'approval' : 'done') : step === 0 ? 'assigned' : 'working'} focus float={false} /></span>
              <span className={t.whoText}>
                <b>{employee.name}</b>
                <small>{employee.assignment}</small>
              </span>
            </span>
          ) : (
            <>
              <span className={t.dots} aria-hidden="true"><i /><i /><i /></span>
              <span className={t.badge}><Image unoptimized src="/homepage/s02/core.webp" alt="" width={18} height={18} />Xroga</span>
              <span className={t.address}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="7" width="8" height="6" rx="1.2" /><path d="M6 7V5.4a2 2 0 0 1 4 0V7" /></svg>
                <span key={url}>{url}</span>
              </span>
            </>
          )}
          <span className={t.state} data-on={operating || undefined} data-wait={last && result.state === 'approval' ? '' : undefined} data-done={last && result.state === 'review' ? '' : undefined}>
            <i />
            {last ? (result.state === 'approval' ? 'Waiting for you' : 'Ready for review') : operating ? 'Working' : 'Reading'}
          </span>
        </div>
        {mission && (
          <div className={t.request}>
            <span>You asked</span>
            {mission.request}
          </div>
        )}
        <div className={t.viewport} ref={viewport} aria-hidden="true" {...inertIf(true)}>
          <div className={t.camera} style={{ transformOrigin: origin }} data-close={(cur.cam === 'close' && !last && !reduced) || undefined}>
            <AppView ctx={ctx} />
            <Pointer target={cur.target} stepKey={track + cur.stepId} action={cur.action} show={!!cur.target && !last} reduced={reduced} tint={tint} label={employee ? employee.name.split(' ')[0] : 'Xroga'} />
            {note && <Callout key={cur.stepId} at={note.at} text={note.text} kind={note.kind} />}
          </div>
          {employee?.receives && step <= 1 && (
            <div className={t.artifact} data-in="">
              <XMark id="research" size={22} float={false} />
              <span><b>{employee.receives}</b>from the Research Analyst</span>
            </div>
          )}
          {employee?.sends && last && (
            <div className={t.artifact} data-out="">
              <span><b>{employee.sends.title}</b>to {EMPLOYEES.find((e) => e.id === employee.sends!.to)!.name}</span>
              <XMark id={employee.sends.to} size={22} float={false} />
            </div>
          )}
        </div>
        {last && !showWork && <ResultLayer result={result} kind={mission ? 'mission' : 'employee'} found={notes.length} />}
      </div>
      {last && (
        <div className={t.after}>
          <button type="button" className={t.link} onClick={() => setShowWork((v) => !v)}>{showWork ? 'Show the result' : 'Show the work'}</button>
          <button type="button" className={t.link} onClick={onReplay}>Watch again</button>
        </div>
      )}
    </div>
  );
}

function Callout({ at, text, kind }: { at: string; text: string; kind: 'pass' | 'fail' | 'info' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; flip: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const scope = el?.parentElement;
    const target = scope?.querySelector(`[data-t="${at}"]`) as HTMLElement | null;
    if (!el || !scope || !target) return;
    let x = 0;
    let y = 0;
    for (let n: HTMLElement | null = target; n && n !== scope; n = n.offsetParent as HTMLElement | null) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    const below = y + target.offsetHeight + 10;
    const flip = below + 60 > scope.clientHeight;
    setPos({ x: Math.max(8, Math.min(x, scope.clientWidth - 300)), y: flip ? y - 10 : below, flip });
  }, [at]);
  return (
    <span ref={ref} className={t.callout} data-kind={kind} data-flip={pos?.flip || undefined} style={pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}>
      {text}
    </span>
  );
}

function ResultLayer({ result, kind, found }: { result: Result; kind: 'mission' | 'employee'; found: number }) {
  return (
    <div className={t.result} data-state={result.state}>
      <div className={t.resHead}>
        <Image unoptimized src="/homepage/s02/core.webp" alt="" width={30} height={30} />
        <span>
          <small>{kind === 'mission' ? 'Handed back to you' : 'Delivered to you'}</small>
          <b>{result.title}</b>
        </span>
      </div>
      <ul>
        {result.lines.map((l) => (
          <li key={l.text} data-mark={l.mark}>{l.text}</li>
        ))}
      </ul>
      <div className={t.resFoot}>
        <span className={t.lock} data-state={result.state}>{result.gate}</span>
        {found > 0 && <small>{found} finding{found > 1 ? 's' : ''} attached</small>}
      </div>
    </div>
  );
}
