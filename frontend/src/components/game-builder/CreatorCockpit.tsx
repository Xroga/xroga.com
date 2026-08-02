'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScenePreset, SystemId } from '@/lib/gameCockpitContent';
import { GENERATED_SYSTEMS } from '@/lib/gameCockpitContent';
import { BuildActivity } from './BuildActivity';
import { GamePreview } from './GamePreview';
import { HudIcon } from './HudIcons';
import { InspectorPanel } from './InspectorPanel';
import { SceneOutline } from './SceneOutline';

/**
 * The Creator Cockpit — the hero's proof that this builds games.
 *
 * It replaces the voxel island. The island was decoration; this is a small working
 * model of the product: a preview you can play and pause, a scene list that drives
 * an inspector, a systems grid that reflects the chosen idea, and a build log.
 *
 * Deliberately not fake browser chrome. The toolbar carries the project name, a
 * real Play control, and a status — the things an editor shows — rather than a
 * pretend URL bar pretending to be a screenshot of a different app.
 *
 * All state is local and deterministic. Nothing is randomised, so a screenshot
 * taken twice is identical, and nothing polls: the preview is CSS animation
 * toggled by a class, and the activity list advances only while it is on screen.
 */
export function CreatorCockpit({
  scene,
  onEditWithAi,
}: {
  scene: ScenePreset;
  onEditWithAi: () => void;
}) {
  const [playing, setPlaying] = useState(true);
  // Scene 2 is the first playable level in every preset, which is what the preview
  // shows; starting the selection there keeps the panels consistent with the art.
  const [sceneIndex, setSceneIndex] = useState(2);
  const [activeSystem, setActiveSystem] = useState<SystemId | null>(null);
  const [showOutline, setShowOutline] = useState(true);
  const [showActivity, setShowActivity] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);

  // A preset swap resets the panels, otherwise the outline could point at a scene
  // index the new preset does not have.
  useEffect(() => {
    setSceneIndex(2);
    setActiveSystem(null);
  }, [scene.id]);

  // Pause the preview when the cockpit scrolls away. The animation is cheap, but
  // running it under the fold is still work for nothing.
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setPlaying(false);
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const sceneName = scene.scenes[sceneIndex] ?? scene.scenes[0];
  const enabled = new Set(scene.systems);

  return (
    <div className="xv-gc-cockpit" ref={frameRef}>
      {/* ------------------------------------------------------------ toolbar */}
      <div className="xv-gc-cockpit__bar">
        <span className="xv-gc-tab" aria-hidden="true">
          <HudIcon name="close" size={11} />
        </span>
        <span className="xv-gc-project">{scene.project}</span>
        <HudIcon name="chevron" size={11} className="xv-gc-cockpit__sep" />

        <button
          type="button"
          className="xv-gc-play"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
        >
          <HudIcon name={playing ? 'pause' : 'play'} size={12} />
          {playing ? 'Pause' : 'Play'}
        </button>

        <span className="xv-gc-status" data-state="ready">
          <span className="xv-gc-status__dot" aria-hidden="true" />
          Ready
        </span>

        <span className="xv-gc-cockpit__right">
          <span className="xv-gc-cockpit__viewport">{scene.runtime} · Web</span>
          <span className="xv-gc-iconbtn xv-gc-iconbtn--static" aria-hidden="true">
            <HudIcon name="expand" size={13} />
          </span>
        </span>
      </div>

      {/* ---------------------------------------------------- preview + panels */}
      <div className="xv-gc-cockpit__body">
        <div className="xv-gc-cockpit__main">
          <div className="xv-gc-viewport">
            <GamePreview scene={scene} playing={playing} />

            <div className="xv-gc-hud">
              <span className="xv-gc-hud__hearts" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="xv-gc-hud__bar" aria-hidden="true">
                <span />
              </span>
              <span className="xv-gc-hud__score">
                <span className="xv-gc-hud__score-label">Score</span>
                <span className="xv-gc-hud__score-value">002450</span>
              </span>
            </div>

            {!playing && (
              <span className="xv-gc-viewport__paused" aria-hidden="true">
                Paused
              </span>
            )}
            {/* The art is decorative; this line is what assistive tech gets. */}
            <p className="xv-gc-sr" aria-live="polite">
              {`${scene.project} preview, ${sceneName}. ${playing ? 'Playing' : 'Paused'}.`}
            </p>
          </div>

          <div className="xv-gc-cockpit__lower">
            {showActivity ? (
              <BuildActivity variant="log" onClose={() => setShowActivity(false)} />
            ) : (
              <button type="button" className="xv-gc-panel xv-gc-panel--collapsed" onClick={() => setShowActivity(true)}>
                Show build activity
              </button>
            )}

            <section className="xv-gc-panel xv-gc-systems" aria-labelledby="gc-systems-title">
              <header className="xv-gc-panel__head">
                <h3 className="xv-gc-panel__title" id="gc-systems-title">
                  Generated systems
                </h3>
              </header>
              <ul className="xv-gc-systems__grid">
                {GENERATED_SYSTEMS.map((system) => {
                  const on = enabled.has(system.id);
                  return (
                    <li key={system.id}>
                      <button
                        type="button"
                        className="xv-gc-system"
                        data-on={on ? 'true' : 'false'}
                        aria-pressed={activeSystem === system.id}
                        onClick={() => setActiveSystem((s) => (s === system.id ? null : system.id))}
                      >
                        <HudIcon name={system.id} size={18} />
                        <span className="xv-gc-system__label">{system.short}</span>
                        {/* Status is not carried by colour alone. */}
                        <span className="xv-gc-system__state">{on ? 'included' : 'not in this build'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {activeSystem && (
                <p className="xv-gc-systems__detail">
                  {GENERATED_SYSTEMS.find((s) => s.id === activeSystem)?.body}
                </p>
              )}
            </section>
          </div>
        </div>

        <aside className="xv-gc-cockpit__side">
          {showOutline ? (
            <SceneOutline
              scenes={scene.scenes}
              selected={sceneIndex}
              onSelect={setSceneIndex}
              onClose={() => setShowOutline(false)}
            />
          ) : (
            <button type="button" className="xv-gc-panel xv-gc-panel--collapsed" onClick={() => setShowOutline(true)}>
              Show scene outline
            </button>
          )}
          <InspectorPanel scene={scene} sceneName={sceneName} onEditWithAi={onEditWithAi} />
        </aside>
      </div>
    </div>
  );
}
