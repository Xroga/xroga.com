"use client";

/**
 * S00 stage (V6 §2, §7): left = what Xroga is producing, centre = Xroga, right = the tools it chose.
 * Lines are measured from the real layout, so every route starts at a specific tool and ends at Xroga,
 * and the creation filament ends at the work object. At most three lines, each gone after its action.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { Frame } from "./orchestration";
import { Toolset } from "./Toolset";
import { WorkObject } from "./WorkObject";
import { XrogaOrb } from "./XrogaOrb";
import s from "./Stage.module.css";

export type StageMode = "desk" | "tablet" | "mobile";
type Box = { x: number; y: number; w: number; h: number };
interface Geo {
  orb: { x: number; y: number; r: number };
  out: Box;
  /** Measured endpoint of each provider currently in the rack, keyed by provider id. */
  providers: Record<string, Box>;
  barTop: number;
}

const rel = (el: Element, base: DOMRect): Box => {
  const r = el.getBoundingClientRect();
  return {
    x: r.left - base.left,
    y: r.top - base.top,
    w: r.width,
    h: r.height,
  };
};
const f = (n: number) => n.toFixed(1);

/**
 * Tool call, Xroga → provider: leave the rim point facing the unit, arrive on the unit's facing edge.
 * Units in the far rack column are reached through the gap above their row, so the line never hides
 * behind the nearer column.
 */
function callPath(slot: Box, orb: Geo["orb"], slots: Box[]): string {
  const rackLeft = Math.min(...slots.map((b) => b.x));
  if (slot.x > rackLeft + 4 && slot.x > orb.x + orb.r) {
    const gy = slot.y - 5;
    const ex = slot.x + slot.w / 2;
    const ax = rackLeft - 6;
    const a = Math.atan2(gy - orb.y, ax - orb.x);
    const sx = orb.x + Math.cos(a) * orb.r * 0.94;
    const sy = orb.y + Math.sin(a) * orb.r * 0.94;
    return `M${f(sx)} ${f(sy)} C${f(sx + Math.cos(a) * 34)} ${f(sy + Math.sin(a) * 34)} ${f(ax - 30)} ${f(gy)} ${f(ax)} ${f(gy)} L${f(ex - 6)} ${f(gy)} Q${f(ex)} ${f(gy)} ${f(ex)} ${f(slot.y)}`;
  }
  const side = slot.x > orb.x + orb.r * 0.6;
  const ex = side ? slot.x - 2 : slot.x + slot.w / 2;
  const ey = side ? slot.y + slot.h / 2 : slot.y - 2;
  const a = Math.atan2(ey - orb.y, ex - orb.x);
  const sx = orb.x + Math.cos(a) * orb.r * 0.94;
  const sy = orb.y + Math.sin(a) * orb.r * 0.94;
  const c1 = [sx + Math.cos(a) * 34, sy + Math.sin(a) * 34];
  const c2 = side ? [ex - Math.max(30, (ex - sx) * 0.45), ey] : [ex, ey - 30];
  return `M${f(sx)} ${f(sy)} C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(ex)} ${f(ey)}`;
}

/** Intent, command bar → Xroga: from the bar's input edge up into the orb's lower rim. */
function intentPath(barTop: number, orb: Geo["orb"]): string {
  const sx = orb.x,
    sy = barTop - 2,
    ex = orb.x,
    ey = orb.y + orb.r * 0.94;
  return `M${f(sx)} ${f(sy)} C${f(sx + 14)} ${f(sy - (sy - ey) * 0.4)} ${f(ex - 10)} ${f(ey + (sy - ey) * 0.35)} ${f(ex)} ${f(ey)}`;
}

/** Xroga → work object (creation and verification). */
function createPath(out: Box, orb: Geo["orb"], mode: StageMode): string {
  if (mode === "mobile") {
    const sx = orb.x,
      sy = orb.y + orb.r * 0.94,
      ex = out.x + out.w / 2,
      ey = out.y;
    return `M${f(sx)} ${f(sy)} C${f(sx)} ${f(sy + 20)} ${f(ex)} ${f(ey - 20)} ${f(ex)} ${f(ey)}`;
  }
  const ex = out.x + out.w + 4;
  const ey = out.y + out.h / 2;
  const a = Math.atan2(ey - orb.y, ex - orb.x);
  const sx = orb.x + Math.cos(a) * orb.r * 0.94;
  const sy = orb.y + Math.sin(a) * orb.r * 0.94;
  return `M${f(sx)} ${f(sy)} C${f(sx - 40)} ${f(sy)} ${f(ex + 40)} ${f(ey)} ${f(ex)} ${f(ey)}`;
}

export function Stage({
  frame,
  mode,
  reduced,
  barRef,
}: {
  frame: Frame;
  mode: StageMode;
  reduced: boolean;
  barRef: React.RefObject<HTMLFormElement | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const count = mode === "mobile" ? 3 : mode === "tablet" ? 4 : 6;
  const routeKey = frame.routes.map((r) => r.id).join();

  useLayoutEffect(() => {
    const measure = () => {
      if (!root.current || !orbRef.current || !outRef.current) return;
      const base = root.current.getBoundingClientRect();
      const o = rel(orbRef.current, base);
      const bar = barRef.current?.getBoundingClientRect();
      // endpoints come from the provider's own element (its untransformed slot), found by provider id
      const providers: Record<string, Box> = {};
      root.current
        .querySelectorAll<HTMLElement>("[data-provider]")
        .forEach((el) => {
          const id = el.dataset.provider;
          if (id && el.parentElement) providers[id] = rel(el.parentElement, base);
        });
      setGeo({
        orb: { x: o.x + o.w / 2, y: o.y + o.h / 2, r: o.w / 2 },
        out: rel(outRef.current, base),
        providers,
        barTop: bar ? bar.top - base.top : o.y + o.h + 80,
      });
    };
    // anchors are measured from the rendered layout and re-measured on resize, breakpoint changes,
    // each job change (rack swap and object morph), each new route and once fonts settle, so no line points
    // at stale geometry or at a unit that is still leaving
    measure();
    const ro = new ResizeObserver(measure);
    if (root.current) ro.observe(root.current);
    if (barRef.current) ro.observe(barRef.current);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [count, barRef, frame.vignette, frame.set, routeKey]);

  const active = new Set<string>(frame.active);
  const used = new Set<string>(frame.used);
  const toOrb: [number, number] = geo
    ? [
        geo.orb.x - (geo.out.x + geo.out.w / 2),
        geo.orb.y - (geo.out.y + geo.out.h / 2),
      ]
    : [200, 0];

  return (
    <div ref={root} className={s.stage} data-mode={mode}>
      <div ref={outRef} className={s.left}>
        <WorkObject
          work={frame.work}
          leaving={frame.leaving}
          leavingFx={frame.leavingFx}
          effects={frame.effects}
          cursor={frame.cursor}
          sending={frame.briefSent}
          toOrb={toOrb}
        />
      </div>

      <div ref={orbRef} className={s.centre}>
        <XrogaOrb
          beat={frame.orb}
          turn={frame.turn}
          reduced={reduced}
          allowDrag={mode === "desk"}
        />
      </div>

      <div className={s.right}>
        <Toolset
          set={frame.set}
          prevSet={frame.prevSet}
          active={active}
          used={used}
          count={count}
        />
      </div>

      {geo && !reduced && (
        <svg className={s.lines} aria-hidden="true">
          {/* A. intent: the request travels from the command bar into Xroga */}
          {frame.intent && (
            <g key={`i-${frame.intent}`} data-signal="intent">
              <path
                d={intentPath(geo.barTop, geo.orb)}
                pathLength={1}
                className={s.filament}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={intentPath(geo.barTop, geo.orb)}
                pathLength={1}
                className={s.packet}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          {frame.routes.map((r) => {
            // the endpoint is the element of the provider this action lights; no element, no line
            const end = geo.providers[r.tool];
            if (!end) return null;
            const call = callPath(end, geo.orb, Object.values(geo.providers));
            const hop = createPath(geo.out, geo.orb, mode);
            return (
              <g
                key={r.id}
                data-signal="tool"
                data-tool={r.tool}
                data-action={r.id}
              >
                {/* B. tool call out to the provider, and its answer back along the same path */}
                <path
                  d={call}
                  pathLength={1}
                  className={s.filament}
                  data-leg="call"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={call}
                  pathLength={1}
                  className={s.packet}
                  data-leg="out"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={call}
                  pathLength={1}
                  className={s.packet}
                  data-leg="back"
                  vectorEffect="non-scaling-stroke"
                />
                {/* C. result: Xroga hands the answer to the work object, which changes ~150 ms after arrival */}
                <path
                  d={hop}
                  pathLength={1}
                  className={s.filament}
                  data-leg="result"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={hop}
                  pathLength={1}
                  className={s.packet}
                  data-leg="result"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
          {frame.createLine && (
            <g key={`c-${frame.vignette}-${frame.orb}`} data-signal="create">
              <path
                d={createPath(geo.out, geo.orb, mode)}
                pathLength={1}
                className={s.filament}
                data-leg="create"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={createPath(geo.out, geo.orb, mode)}
                pathLength={1}
                className={s.packet}
                data-leg="create"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
