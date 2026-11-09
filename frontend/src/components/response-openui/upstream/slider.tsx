'use client';

import { useId } from 'react';

export type ScenarioRangeProps = {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: string;
  onChange: (value: string) => void;
};

// Adapted from Open Intelligent UI controls.tsx. Xroga owns scenario state,
// validation and reset so the range and exact number entry stay in sync.
export function ScenarioRange({ label, unit, min, max, step, value, onChange }: ScenarioRangeProps) {
  const id = useId();
  const raw = value.trim() === '' ? NaN : Number(value);
  const position = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : min;
  const number = position.toLocaleString(undefined, { maximumFractionDigits: 12 });
  const readout = unit && /^[$€£¥₹]/u.test(unit) ? `${unit}${number}` : [number, unit].filter(Boolean).join(' ');
  return <div className="iui-slider">
    <div className="iui-slider-head">
      <label htmlFor={id}>Adjust {label}</label>
      <span>{readout}</span>
    </div>
    <input id={id} className="iui-range" type="range" min={min} max={max} step={step}
      value={position} aria-valuetext={readout} onChange={event => onChange(event.target.value)} />
    <div className="iui-slider-head" aria-hidden="true"><span>{min.toLocaleString()}</span><span>{max.toLocaleString()}</span></div>
  </div>;
}
