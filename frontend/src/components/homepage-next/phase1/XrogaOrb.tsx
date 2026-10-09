"use client";

/**
 * The Xroga orb as an optical object (V3 §4–§6, §37–§41). Option B (layered 2.5D): every layer
 * is cut from the founder-supplied master logo (public/homepage/orb/*, generated from the 1254px
 * master), so the identity is exact — no redrawn X, no recolouring.
 *   back (darkened, blurred) · body (full orb) · rim (outer iridescent ring) · X (luminous mark)
 * plus an angle-dependent iridescent film, an independently moving specular highlight and a slow
 * studio-light sweep. Pointer tilt ≤4°/3°, drag inspection ≤28°/14° with inertia.
 */
import Image from "next/image";
import {
  motion,
  useMotionTemplate,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import s from "./XrogaOrb.module.css";

const SPRING = { stiffness: 70, damping: 16, mass: 1 };
/** The rim is heavier than the face: on release the face settles first, the rim ~100 ms later (V7 §37). */
const RING_SPRING = { stiffness: 48, damping: 13, mass: 1 };
const TURN_MS = 1100; // with the lens and X lags the whole turn lasts ~1.2 s (V10 §24: 900 to 1250 ms)

export type OrbBeatName = "idle" | "absorb" | "create" | "connect" | "verify" | "native";

/** Rim copies stacked behind the face: the orb shows real edge thickness when it turns (V6 §22). */
const SLICES = [4, 8, 12, 16, 20];

export function XrogaOrb({
  beat,
  turn,
  reduced,
  allowDrag,
}: {
  beat: OrbBeatName;
  /** A transition turn between jobs (key changes per transition). */
  turn: { key: string; dir: 1 | -1 } | null;
  reduced: boolean;
  allowDrag: boolean;
}) {
  // The centre never moves (V7 §34): all life comes from yaw, pitch, ring lag, lens depth and light.
  const rx = useSpring(0, SPRING);
  const ry = useSpring(0, SPRING);
  const ringRx = useSpring(0, RING_SPRING);
  const ringRy = useSpring(0, RING_SPRING);
  const root = useRef<HTMLDivElement>(null);
  const turnRef = useRef<HTMLDivElement>(null);
  const lagRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLImageElement>(null);
  const specRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; on: boolean }>({
    x: 0,
    y: 0,
    on: false,
  });
  const rest = useRef({ rx: 0, ry: 0 });
  // Edge slices are only needed when the orb is turned far enough to show its side (drag), so they
  // mount for the gesture and its spring back, not all the time.
  const [inspecting, setInspecting] = useState(false);
  const inspectTimer = useRef(0);

  useEffect(() => {
    if (reduced) {
      rx.jump(-6);
      ry.jump(9);
      return;
    }
    const onMove = (e: PointerEvent) => {
      if (drag.current.on) return;
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      // pointer is quieter than drag: yaw ≤ 2°, pitch ≤ 1.25° (V10 §26)
      rest.current = { rx: -ny * 2.5, ry: nx * 4 };
      set(rest.current.rx, rest.current.ry);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Transition turn (V7 §35, V8 §48): a small preparatory yaw, the ring travelling further, the lens
  // lagging ~90 ms, the X shifting in depth, the highlight crossing the rim, then the orb settles last.
  const turnKey = turn?.key;
  const turnDir = turn?.dir ?? 1;
  useEffect(() => {
    if (!turnKey || reduced) return;
    const d = turnDir;
    const ease = "cubic-bezier(0.45, 0, 0.2, 1)";
    const anims = [
      turnRef.current?.animate(
        [
          { transform: "rotateY(0deg) rotateX(0deg)" },
          { transform: `rotateY(${-3 * d}deg) rotateX(0.5deg)`, offset: 0.16 },
          { transform: `rotateY(${16 * d}deg) rotateX(-1.5deg)`, offset: 0.55 },
          { transform: "rotateY(0deg) rotateX(0deg)" },
        ],
        { duration: TURN_MS, easing: ease },
      ),
      lagRef.current?.animate(
        [
          { transform: "rotateY(0deg) rotateZ(0deg)" },
          {
            transform: `rotateY(${7 * d}deg) rotateZ(${9 * d}deg)`,
            offset: 0.42,
          },
          { transform: "rotateY(0deg) rotateZ(0deg)" },
        ],
        // the outer ring leads the turn (V10 §24), then needs the longest to settle
        { duration: TURN_MS + 50, delay: 0, easing: ease },
      ),
      lensRef.current?.animate(
        [
          { transform: "translateZ(0px)" },
          { transform: "translateZ(7px)", offset: 0.5 },
          { transform: "translateZ(0px)" },
        ],
        { duration: TURN_MS, delay: 90, easing: ease },
      ),
      root.current?.animate(
        [
          { "--xz": "16px" },
          { "--xz": "21px", offset: 0.5 },
          { "--xz": "16px" },
        ] as Keyframe[],
        {
          duration: TURN_MS,
          delay: 140,
          easing: ease,
        },
      ),
      specRef.current?.animate(
        [
          { transform: "translateX(0%)" },
          { transform: `translateX(${-14 * d}%)`, offset: 0.55 },
          { transform: "translateX(0%)" },
        ],
        { duration: TURN_MS + 200, easing: ease },
      ),
    ];
    return () => anims.forEach((a) => a?.cancel());
  }, [turnKey, turnDir, reduced]);

  function set(x: number, y: number) {
    rx.set(x);
    ry.set(y);
    ringRx.set(x);
    ringRy.set(y);
  }

  const onDown = (e: React.PointerEvent) => {
    if (!allowDrag || reduced) return;
    e.preventDefault(); // no native image drag or text selection: those would cancel the pointer
    window.clearTimeout(inspectTimer.current);
    setInspecting(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, on: true };
  };
  const onDrag = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    set(
      Math.max(-13, Math.min(13, rest.current.rx - dy * 0.18)),
      Math.max(-27, Math.min(27, rest.current.ry + dx * 0.22)),
    );
  };
  const onUp = () => {
    if (!drag.current.on) return;
    drag.current.on = false;
    set(rest.current.rx, rest.current.ry); // face springs back first, rim follows on its heavier spring
    inspectTimer.current = window.setTimeout(() => setInspecting(false), 2400);
  };

  // Highlight moves against the rotation, so the front reads as convex glass.
  const hx = useTransform(ry, (v) => 34 - v * 1.1);
  const hy = useTransform(rx, (v) => 26 + v * 1.1);
  const film = useTransform(ry, (v) => v * 4);
  // internal X parallax: 1 to 2 px under the pointer, capped at 3 px when dragged
  const px = useTransform(ry, (v) => Math.max(-3, Math.min(3, v * 0.5)));
  const py = useTransform(rx, (v) => Math.max(-3, Math.min(3, -v * 0.6)));
  const lagX = useTransform([ringRx, rx], ([a, b]: number[]) => a - b);
  const lagY = useTransform([ringRy, ry], ([a, b]: number[]) => a - b);

  const transform = useMotionTemplate`rotateX(${rx}deg) rotateY(${ry}deg)`;
  const ringLag = useMotionTemplate`rotateX(${lagX}deg) rotateY(${lagY}deg)`;
  const spec = useMotionTemplate`radial-gradient(42% 34% at ${hx}% ${hy}%, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08) 45%, transparent 70%)`;
  const filmRot = useMotionTemplate`rotate(${film}deg)`;
  const xShift = useMotionTemplate`translate3d(${px}px, ${py}px, var(--xz, 16px))`;

  return (
    <div
      ref={root}
      className={s.orb}
      data-beat={beat}
      data-reduced={reduced || undefined}
      data-drag={allowDrag || undefined}
      onPointerDown={onDown}
      onPointerMove={onDrag}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="img"
      aria-label="Xroga"
    >
      <div className={s.under} aria-hidden="true" />
      <div className={s.idle}>
        <div ref={turnRef} className={s.turn}>
          <motion.div className={s.body} style={{ transform }}>
            <Image
              className={s.back}
              src="/homepage/orb/xroga-orb-back.webp"
              alt=""
              draggable={false}
              width={760}
              height={760}
              aria-hidden="true"
            />
            {inspecting &&
              SLICES.map((z, i) => (
                <Image
                  key={z}
                  className={s.slice}
                  style={
                    {
                      "--z": `${-z}px`,
                      "--b": 0.62 - i * 0.08,
                    } as React.CSSProperties
                  }
                  src="/homepage/orb/xroga-orb-rim.webp"
                  alt=""
                  draggable={false}
                  width={760}
                  height={760}
                  aria-hidden="true"
                />
              ))}
            <Image
              ref={lensRef}
              className={s.full}
              src="/homepage/orb/xroga-orb-body.webp"
              alt=""
              draggable={false}
              width={760}
              height={760}
              priority
            />
            <motion.div className={s.ringLag} style={{ transform: ringLag }}>
              <div ref={lagRef} className={s.ringTurn}>
                <div className={s.rimWrap}>
                  <Image
                    className={s.rim}
                    src="/homepage/orb/xroga-orb-rim.webp"
                    alt=""
                    draggable={false}
                    width={760}
                    height={760}
                    aria-hidden="true"
                  />
                  <motion.div
                    className={s.film}
                    style={{ transform: filmRot }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </motion.div>
            <motion.div className={s.xWrap} style={{ transform: xShift }}>
              <Image
                className={s.x}
                src="/homepage/orb/xroga-orb-x.webp"
                alt=""
                draggable={false}
                width={760}
                height={760}
                aria-hidden="true"
              />
            </motion.div>
            <motion.div
              ref={specRef}
              className={s.spec}
              style={{ backgroundImage: spec }}
              aria-hidden="true"
            />
            <div className={s.sweep} aria-hidden="true" />
            <i className={s.flare} data-side="left" aria-hidden="true" />
            <i className={s.flare} data-side="right" aria-hidden="true" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
