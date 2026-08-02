'use client';

import { HudIcon } from './HudIcons';

/**
 * The cockpit's scene list.
 *
 * A real listbox rather than a decorative column: each row is a button, the
 * selected row carries `aria-current`, and arrow keys move the selection the way a
 * scene tree in an editor does. Selecting a row is what drives the inspector, so
 * this had to be operable from the keyboard rather than hover-only.
 */
export function SceneOutline({
  scenes,
  selected,
  onSelect,
  onClose,
}: {
  scenes: readonly string[];
  selected: number;
  onSelect: (index: number) => void;
  onClose?: () => void;
}) {
  function handleKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? (selected + 1) % scenes.length : (selected - 1 + scenes.length) % scenes.length;
    onSelect(next);
    const list = event.currentTarget;
    const target = list.querySelectorAll<HTMLButtonElement>('.xv-gc-outline__row')[next];
    target?.focus();
  }

  return (
    <section className="xv-gc-panel xv-gc-outline" aria-labelledby="gc-outline-title">
      <header className="xv-gc-panel__head">
        <h3 className="xv-gc-panel__title" id="gc-outline-title">
          Scene outline
        </h3>
        {onClose && (
          <button type="button" className="xv-gc-iconbtn" onClick={onClose} aria-label="Hide scene outline">
            <HudIcon name="close" size={13} />
          </button>
        )}
      </header>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
      <div className="xv-gc-outline__list" role="group" aria-label="Scenes" onKeyDown={handleKey}>
        {scenes.map((scene, index) => (
          <button
            key={scene}
            type="button"
            className="xv-gc-outline__row"
            aria-current={index === selected ? 'true' : undefined}
            onClick={() => onSelect(index)}
          >
            <HudIcon name="chevron" size={11} className="xv-gc-outline__caret" />
            <span>{scene}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
