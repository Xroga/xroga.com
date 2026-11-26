import { describe, expect, it } from 'vitest';
import { RECORD_SCREEN_TOOL, clicksToFractions, describeRecording, recordFilename } from '../record-tool';
import { normalizeSpec, type Layer } from '../compose-spec';

describe('record_screen', () => {
  it('turns clicks in pixels into fractions of the picture, keeping only those inside it', () => {
    const out = clicksToFractions([{ t: 1.234, x: 640, y: 360 }, { t: 2, x: 1300, y: 10 }, { t: 3, x: -5, y: 10 }, { t: 4, x: 0, y: 720 }], { width: 1280, height: 720 });
    expect(out).toEqual([{ t: 1.23, x: 0.5, y: 0.5 }, { t: 4, x: 0, y: 1 }]);
    expect(clicksToFractions([{ t: 1, x: 5, y: 5 }], { width: 0, height: 0 })).toEqual([]);
  });

  it('names the recording from the time, or from what was asked', () => {
    expect(recordFilename(undefined, new Date(2026, 10, 26, 9, 5))).toBe('xroga-recording-20261126-0905.mp4');
    expect(recordFilename('demo.webm')).toBe('demo.webm');
    expect(recordFilename('../x.mp4', new Date(2026, 0, 2, 3, 4))).toBe('xroga-recording-20260102-0304.mp4');
  });

  it('describes a recording and how to make a demo from its clicks', () => {
    const text = describeRecording({ seconds: 12.34, frames: 200, bytes: 3 * 1048576, width: 1280, height: 720, container: 'mp4', clicks: [{ t: 1, x: 0.5, y: 0.5 }], notes: [] });
    expect(text).toContain('Recorded 12.3 s (200 frames, 3.0 MB MP4)');
    expect(text).toContain('"recording:last"');
    expect(text).toContain('[{"t":1,"x":0.5,"y":0.5}]');
    expect(describeRecording({ seconds: 3, frames: 5, bytes: 1000, width: 100, height: 100, container: 'webm', clicks: [], notes: ['a limit'] })).toContain('No clicks were made while recording. Note: a limit.');
    expect(RECORD_SCREEN_TOOL.name).toBe('record_screen');
  });

  it('lets a video layer use the recording and zoom on its clicks', () => {
    const n = normalizeSpec({ clips: [{ layers: [{ type: 'video', url: 'recording:last', zoomOnClicks: { clicks: [{ t: 2, x: 0.3, y: 0.4 }, { t: 9, x: 2, y: -1 }, { t: 'x' }], scale: 2.5 } }] }] });
    expect(n.ok).toBe(true);
    const layer = n.ok ? (n.spec.clips[0]!.layers[0] as Extract<Layer, { type: 'video' }>) : undefined;
    expect(layer!.url).toBe('recording:last');
    expect(layer!.keyframes!.scale!.some(k => k.value === 2.5)).toBe(true);
    // a click outside the picture is held to its edge
    expect(Math.abs(layer!.keyframes!.x!.at(-2)!.value)).toBeLessThanOrEqual(0.75);
    const bad = normalizeSpec({ clips: [{ layers: [{ type: 'video', url: 'recording:last', zoomOnClicks: { clicks: [] } }] }] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('zoomOnClicks needs clicks');
  });
});
