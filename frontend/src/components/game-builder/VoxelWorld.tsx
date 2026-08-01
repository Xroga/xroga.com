'use client';

import { useRef } from 'react';

/**
 * The hero's isometric voxel world.
 *
 * Real 3D built from CSS `preserve-3d`, not WebGL. Each cube is six rotated faces on
 * one element; the platform is a grid of those cubes, arranged and lifted by height.
 * That choice is deliberate on this site: the homepage was measured down to two font
 * preloads and a trimmed CSS bundle, and adding a WebGL runtime plus a render loop to
 * a marketing page would give that back for a decorative scene. This costs one
 * stylesheet and no JavaScript beyond the pointer handler, and lies flat and harmless
 * if scripts never run.
 *
 * The layout is a fixed height map rather than a random one, so the server render and
 * the client hydration produce identical markup — `Math.random()` here would mismatch
 * on every load.
 */

/** Height in blocks per grid cell. 0 means no column at all. */
const HEIGHT_MAP: readonly (readonly number[])[] = [
  [1, 1, 2, 2, 1, 0],
  [1, 2, 3, 2, 1, 1],
  [2, 3, 3, 2, 2, 1],
  [2, 2, 2, 1, 1, 1],
  [1, 1, 1, 1, 0, 0],
];

/** Which ore a column's top face shows. Cycled so the platform is not one flat colour. */
const ORES = ['grass', 'grass', 'stone', 'grass', 'gold', 'grass', 'diamond', 'stone', 'grass', 'emerald'] as const;

function Cube({ ore, level, className }: { ore: string; level: number; className?: string }) {
  return (
    <span className={`xv-gb-cube ${className ?? ''}`} data-ore={ore} style={{ ['--level' as string]: level }}>
      <i className="xv-gb-cube__face xv-gb-cube__face--top" />
      <i className="xv-gb-cube__face xv-gb-cube__face--left" />
      <i className="xv-gb-cube__face xv-gb-cube__face--right" />
    </span>
  );
}

export function VoxelWorld() {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage || event.pointerType === 'touch') return;
    const rect = stage.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      // Yaw only. Letting the pointer drive pitch as well tips the isometric grid off
      // its axis and the platform stops reading as a solid object.
      stage.style.setProperty('--yaw', `${(px * 14).toFixed(2)}deg`);
    });
  }

  function handlePointerLeave() {
    stageRef.current?.style.setProperty('--yaw', '0deg');
  }

  let oreIndex = 0;

  return (
    <div
      ref={stageRef}
      className="xv-gb-world"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-hidden="true"
    >
      <div className="xv-gb-world__scene">
        {HEIGHT_MAP.map((row, z) => (
          <div key={z} className="xv-gb-world__row" style={{ ['--z' as string]: z }}>
            {row.map((height, x) => {
              if (height === 0) return <span key={x} className="xv-gb-world__gap" style={{ ['--x' as string]: x }} />;
              const ore = ORES[oreIndex++ % ORES.length];
              return (
                <span key={x} className="xv-gb-world__cell" style={{ ['--x' as string]: x }}>
                  {Array.from({ length: height }, (_, level) => (
                    <Cube key={level} ore={level === height - 1 ? ore : 'stone'} level={level} />
                  ))}
                </span>
              );
            })}
          </div>
        ))}

        {/* A player-ish block that hops across the platform, so the scene reads as a
            game rather than a still render. Pure keyframes — no loop, no physics. */}
        <span className="xv-gb-world__player">
          <Cube ore="player" level={0} />
        </span>
      </div>
    </div>
  );
}
