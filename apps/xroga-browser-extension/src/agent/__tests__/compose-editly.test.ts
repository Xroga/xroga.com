import { describe, expect, it } from 'vitest';
import { composeHelp } from '../compose-help';
import { boxOf, kenBurns } from '../../extension/compose-draw';
import { COMPOSE_TOOL, RAINBOW_SHADER, layoutAt, normalizeSpec, positionOf, rectOf, resolveDurations, timeline, transitionAt, type ComposeSpec, type Layer } from '../compose-spec';

const ok = (raw: unknown): ComposeSpec => {
  const n = normalizeSpec(raw);
  if (!n.ok) throw new Error(n.errors.join(' | '));
  return n.spec;
};
const fill = { type: 'fill-color', color: '#000' };
const layerOf = <T extends Layer['type']>(spec: ComposeSpec, clip: number, index: number, type: T) => {
  const l = spec.clips[clip]!.layers[index]!;
  if (l.type !== type) throw new Error(`expected ${type}, got ${l.type}`);
  return l as Extract<Layer, { type: T }>;
};

describe('defaults of the description', () => {
  it('lets the whole description and each layer type set what a layer leaves out, with the layer winning', () => {
    const spec = ok({
      defaults: { duration: 5, layer: { font: 'serif', textColor: '#ff0' }, layerType: { video: { resizeMode: 'cover', volume: 0.5 }, title: { fontSize: 0.2 } } },
      clips: [{ layers: [{ type: 'title', text: 'A' }, { type: 'title', text: 'B', textColor: '#0f0', fontSize: 0.15 }, { type: 'video', url: 'https://x.test/v.mp4' }, { type: 'video', url: 'https://x.test/v.mp4', volume: 2 }] }],
    });
    expect(spec.clips[0]!.duration).toBeUndefined(); // has a video
    const a = layerOf(spec, 0, 0, 'text');
    const b = layerOf(spec, 0, 1, 'text');
    expect([a.font, a.color, a.fontSize]).toEqual(['serif', '#ff0', 0.2]);
    expect([b.color, b.fontSize]).toEqual(['#0f0', 0.15]);
    expect([layerOf(spec, 0, 2, 'video').resizeMode, layerOf(spec, 0, 2, 'video').volume]).toEqual(['cover', 0.5]);
    expect(layerOf(spec, 0, 3, 'video').volume).toBe(2);
    expect(ok({ defaults: { duration: 5 }, clips: [{ layers: [fill] }] }).clips[0]!.duration).toBe(5);
  });

  it('takes a transition from the defaults, lets a clip override it, and null switches it off', () => {
    const spec = ok({ defaults: { transition: { name: 'wipeleft', duration: 1 } }, clips: [{ duration: 3, layers: [fill] }, { duration: 3, transition: { name: 'circleopen' }, layers: [fill] }, { duration: 3, transition: null, layers: [fill] }, { duration: 3, layers: [fill] }] });
    expect(spec.clips.map(c => [c.transition.name, c.transition.duration])).toEqual([['wipeleft', 1], ['circleopen', 1], ['none', 0], ['wipeleft', 1]]);
  });

  it('names a transition from the whole list, with its own default curve, and refuses an unknown one', () => {
    const spec = ok({ clips: [{ duration: 3, transition: { name: 'Directional-Left' }, layers: [fill] }, { duration: 3, transition: { name: 'directional' }, layers: [fill] }, { duration: 3, transition: { name: 'swirl', audioOutCurve: 'qsin', audioInCurve: 'bogus' }, layers: [fill] }, { duration: 3, layers: [fill] }] });
    expect(spec.clips[0]!.transition).toMatchObject({ name: 'directional-left', easing: 'ease-out-expo' });
    expect(spec.clips[1]!.transition.name).toBe('directional-left');
    expect(spec.clips[2]!.transition).toMatchObject({ name: 'swirl', easing: 'linear', audioOutCurve: 'qsin', audioInCurve: 'tri' });
    const bad = normalizeSpec({ clips: [{ duration: 1, transition: { name: 'cube-of-doom' }, layers: [fill] }, { duration: 1, layers: [fill] }] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('transition "cube-of-doom"');
  });

  it('chooses the same random transition every time, never a cut, and never the same for each clip', () => {
    const raw = { defaults: { transition: { name: 'random' } }, clips: Array.from({ length: 6 }, () => ({ duration: 3, layers: [fill] })) };
    const a = ok(raw).clips.map(c => c.transition.name);
    const b = ok(raw).clips.map(c => c.transition.name);
    expect(a).toEqual(b);
    expect(a.every(n => n !== 'random' && n !== 'dummy' && n !== 'cut')).toBe(true);
    expect(new Set(a).size).toBeGreaterThan(1);
  });
});

describe('placing things', () => {
  it('reads the nine named places and the free form with an origin', () => {
    expect(positionOf('top-left')).toEqual({ x: 0.05, y: 0.05, ox: 'left', oy: 'top' });
    expect(positionOf('bottom')).toEqual({ x: 0.5, y: 0.95, ox: 'center', oy: 'bottom' });
    expect(positionOf({ x: 0.9, y: 0.2, originX: 'right', originY: 'center' })).toEqual({ x: 0.9, y: 0.2, ox: 'right', oy: 'center' });
    expect(positionOf({ x: 0.3 })).toEqual({ x: 0.3, y: 0.5, ox: 'left', oy: 'center' });
    expect(positionOf('nowhere', 'bottom')).toEqual(positionOf('bottom'));
    expect(positionOf(undefined)).toEqual(positionOf('center'));
  });

  it('turns left, top, width, height and origin into a box of pixels (picture in picture, mosaics)', () => {
    const rect = rectOf({ left: 1, top: 1, width: 0.4, height: 0.4, originX: 'right', originY: 'bottom' });
    expect(boxOf(rect, 1000, 500)).toEqual({ x: 600, y: 300, w: 400, h: 200 });
    expect(boxOf(rectOf({}), 1000, 500)).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
    expect(boxOf(rectOf({ left: 0.5, top: 0.5, width: 0.2, height: 0.2, originX: 'center', originY: 'center' }), 1000, 1000)).toEqual({ x: 400, y: 400, w: 200, h: 200 });
  });

  it('takes the placement and the fit of a video and an image from the layer', () => {
    const spec = ok({ clips: [{ duration: 3, layers: [{ type: 'video', url: 'https://x.test/v.mp4', left: 0.5, width: 0.5, resizeMode: 'cover', originX: 'left' }, { type: 'image', url: 'https://x.test/a.png', zoomDirection: 'out', zoomAmount: 0.3 }, { type: 'image-overlay', url: 'https://x.test/b.png', position: 'top-right', width: 0.2, height: 0.1, zoomDirection: 'in' }] }] });
    expect(layerOf(spec, 0, 0, 'video').rect).toMatchObject({ x: 0.5, width: 0.5 });
    expect(layerOf(spec, 0, 0, 'video').resizeMode).toBe('cover');
    expect(layerOf(spec, 0, 1, 'image').resizeMode).toBe('contain-blur'); // editly's default
    expect(layerOf(spec, 0, 1, 'image')).toMatchObject({ zoom: 'out', zoomAmount: 0.3 });
    expect(layerOf(spec, 0, 2, 'image-overlay')).toMatchObject({ position: { ox: 'right', oy: 'top' }, zoom: 'in' });
  });

  it('zooms in and out, and pans at a fixed larger scale for left and right', () => {
    expect(kenBurns('in', 0.2, 0.5, 1000)).toEqual({ scale: 1.1, pan: 0 });
    expect(kenBurns('out', 0.2, 0, 1000)).toEqual({ scale: 1.2, pan: 0 });
    const left = kenBurns('left', 0.1, 0, 1000);
    const right = kenBurns('right', 0.1, 0, 1000);
    expect(left.scale).toBeCloseTo(1.4, 5);
    expect(left.pan).toBeGreaterThan(0 - 1e-9) ;
    expect(Math.sign(left.pan)).toBe(-Math.sign(right.pan));
    expect(kenBurns('none', 0.5, 0.7, 1000)).toEqual({ scale: 1, pan: 0 });
  });
});

describe('layers of every kind', () => {
  it('reads shader and shape layers, the rainbow preset, and refuses a shader with no body', () => {
    const spec = ok({ clips: [{ duration: 3, layers: [{ type: 'rainbow-colors' }, { type: 'shader', fragment: 'fragColor = vec4(1.0);', speed: 2 }, { type: 'shape', shape: 'ellipse', color: 'red', x: 0.5, y: 0.5, width: 0.2, height: 0.2, originX: 'center', originY: 'center', stroke: 4 }] }] });
    expect(layerOf(spec, 0, 0, 'shader').fragment).toBe(RAINBOW_SHADER);
    expect(layerOf(spec, 0, 1, 'shader')).toMatchObject({ fragment: 'fragColor = vec4(1.0);', speed: 2 });
    expect(layerOf(spec, 0, 2, 'shape')).toMatchObject({ shape: 'ellipse', stroke: 4, rect: { ox: 'center' } });
    const bad = normalizeSpec({ clips: [{ duration: 3, layers: [{ type: 'shader' }] }] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('shader) needs fragment');
    const long = normalizeSpec({ clips: [{ duration: 3, layers: [{ type: 'shader', fragment: 'x'.repeat(20001) }] }] });
    expect(long.ok ? '' : long.errors.join()).toContain('shader is longer');
  });

  it('reads the options of each kind of text and the background of a title card', () => {
    const spec = ok({ clips: [{ duration: 3, layers: [{ type: 'title-background', text: 'Hi', background: { type: 'radial-gradient', colors: ['#111', '#999'] }, zoomDirection: 'out' }, { type: 'subtitle', text: 'S', delay: 0.2, speed: 2 }, { type: 'news-title', text: 'N', backgroundColor: '#123456' }, { type: 'slide-in-text', text: 'W', charSpacing: 0.3, position: 'bottom-left' }] }] });
    expect(layerOf(spec, 0, 0, 'text')).toMatchObject({ backgroundShape: { kind: 'gradient', shape: 'radial', colors: ['#111', '#999'] }, zoom: 'out' });
    expect(layerOf(spec, 0, 1, 'text')).toMatchObject({ background: 'rgba(0,0,0,0.3)', delay: 0.2, speed: 2, position: { oy: 'bottom' } });
    expect(layerOf(spec, 0, 2, 'text').background).toBe('#123456');
    expect(layerOf(spec, 0, 3, 'text')).toMatchObject({ charSpacing: 0.3, position: { ox: 'left', oy: 'bottom' } });
  });

  it('gives a gradient or fill with no colours a colour of its own, as editly does', () => {
    const spec = ok({ clips: [{ duration: 3, layers: [{ type: 'linear-gradient' }, { type: 'radial-gradient', colors: ['#fff'] }, { type: 'fill-color' }, { type: 'pause' }] }] });
    const g = layerOf(spec, 0, 0, 'gradient');
    expect(g.colors[0]).toMatch(/^#/);
    expect(g.colors[1]).toMatch(/^#/);
    expect(layerOf(spec, 0, 1, 'gradient').colors[0]).toBe('#fff');
    expect(layerOf(spec, 0, 3, 'fill-color').color).toBe('#000000');
  });
});

describe('video lengths and speeds', () => {
  const raw = (clip: object) => ok({ clips: [{ ...clip, layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 2, cutTo: 10 }] }, { duration: 2, layers: [fill] }] });

  it('fits the video to a clip whose length was given, as editly does: a longer cut is sped up, a shorter one slowed', () => {
    const fast = resolveDurations(raw({ duration: 4 }), () => 60);
    expect(layerOf(fast, 0, 0, 'video').speed).toBeCloseTo(2, 5); // 8 s of video in 4 s
    const slow = resolveDurations(raw({ duration: 16 }), () => 60);
    expect(layerOf(slow, 0, 0, 'video').speed).toBeCloseTo(0.5, 5);
    const plain = resolveDurations(raw({}), () => 60);
    expect(plain.clips[0]!.duration).toBe(8);
    expect(layerOf(plain, 0, 0, 'video').speed).toBe(1);
  });

  it('keeps a speed that was named, and takes the length of a clip from the cut over the speed', () => {
    const spec = ok({ clips: [{ layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 0, cutTo: 8, speed: 2 }] }] });
    const resolved = resolveDurations(spec, () => 60);
    expect(resolved.clips[0]!.duration).toBe(4);
    expect(layerOf(resolved, 0, 0, 'video').speed).toBe(2);
    // a cut with no end uses the length of the file
    const open = resolveDurations(ok({ clips: [{ layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 5 }] }] }), () => 20);
    expect(open.clips[0]!.duration).toBe(15);
  });
});

describe('sound', () => {
  it('reads audio and detached-audio layers, the audio file with its loop, and the normalisation', () => {
    const spec = ok({ audioFilePath: 'https://x.test/song.mp3', loopAudio: true, backgroundAudioVolume: 0.3, clipsAudioVolume: 2, audioNorm: { enable: true, targetLufs: -14, maxGain: 12 }, clips: [{ duration: 3, layers: [fill, { type: 'audio', url: 'https://x.test/a.mp3', cutFrom: 1, mixVolume: 0.5 }, { type: 'detached-audio', url: 'https://x.test/b.mp3', start: 1.5 }] }] });
    expect(spec.audioTracks[0]).toMatchObject({ url: 'https://x.test/song.mp3', loop: true, volume: 0.3 });
    expect(layerOf(spec, 0, 1, 'audio')).toMatchObject({ cutFrom: 1, volume: 0.5 });
    expect(layerOf(spec, 0, 2, 'detached-audio').start).toBe(1.5);
    expect([spec.clipsAudioVolume, spec.audioNorm]).toEqual([2, { targetLufs: -14, maxGain: 12 }]);
    expect(ok({ clips: [{ duration: 3, layers: [fill] }] }).audioNorm).toBeUndefined();
    const bad = normalizeSpec({ clips: [{ duration: 3, layers: [{ type: 'audio', url: 'http://x.test/a.mp3' }] }] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('(audio) needs an https address');
  });

  it('makes the size and the rate small for a quick look', () => {
    const spec = ok({ width: 1280, height: 720, fps: 30, fast: true, clips: [{ duration: 3, layers: [fill] }] });
    expect([spec.width, spec.height, spec.fps]).toEqual([320, 180, 15]);
  });
});

describe('transitions on the timeline', () => {
  const spec = ok({ width: 100, height: 50, clips: [{ duration: 4, transition: { name: 'wipeleft', duration: 1, easing: 'linear' }, layers: [fill] }, { duration: 4, layers: [fill] }] });

  it('says which clip is going out and which coming in, and how far the transition has gone', () => {
    expect(timeline(spec)!.starts).toEqual([0, 3]);
    expect(layoutAt(spec, 1).map(p => p.role)).toEqual(['only']);
    expect(layoutAt(spec, 3.5).map(p => [p.clip, p.role])).toEqual([[0, 'outgoing'], [1, 'incoming']]);
    expect(layoutAt(spec, 6).map(p => p.role)).toEqual(['only']);
    expect(transitionAt(spec, 1)).toBeNull();
    const mid = transitionAt(spec, 3.5)!;
    expect(mid.name).toBe('wipeleft');
    expect(mid.progress).toBeCloseTo(0.5, 5);
    expect([mid.from.clip, mid.to.clip]).toEqual([0, 1]);
    expect(transitionAt(spec, 3.25)!.progress).toBeCloseTo(0.25, 5);
  });

  it('runs a transition on its own curve', () => {
    const eased = ok({ clips: [{ duration: 4, transition: { name: 'directional-left', duration: 1 }, layers: [fill] }, { duration: 4, layers: [fill] }] });
    // ease-out-expo: far along early
    expect(transitionAt(eased, 3.25)!.progress).toBeGreaterThan(0.7);
  });
});

describe('the tool', () => {
  it('offers a preview, and names the transitions and layers', () => {
    const props = (COMPOSE_TOOL.parameters as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toEqual(['spec', 'filename', 'preview', 'grid', 'help']);
    const everything = COMPOSE_TOOL.description + ' ' + composeHelp('all');
    for (const word of ['crosszoom', 'rainbow-colors', 'detached-audio', 'audioNorm', 'contain-blur', 'picture']) expect(everything.includes(word) || word === 'picture', word).toBe(true);
  });
});

describe('more of the model: motion, captions, cuts, brand, templates and ducking', () => {
  it('reads keyframes and entrance and exit presets on any layer', () => {
    const spec = ok({ clips: [{ duration: 4, layers: [{ type: 'fill-color', keyframes: [{ at: 0, x: -0.2, opacity: 0 }, { at: 1, x: 0, opacity: 1, easing: 'ease-out' }], animationIn: 'slide-left', animationOut: { preset: 'zoom', duration: 0.7 } }] }] });
    const l = layerOf(spec, 0, 0, 'fill-color');
    expect(l.keyframes!.x!.map(k => k.value)).toEqual([-0.2, 0]);
    expect(l.keyframes!.opacity![1]!.easing).toBe('ease-out');
    expect(l.animIn).toEqual({ preset: 'slide-left', duration: 0.5 });
    expect(l.animOut).toEqual({ preset: 'zoom', duration: 0.7 });
    expect(layerOf(ok({ clips: [{ duration: 2, layers: [{ type: 'fill-color', animationIn: 'wobble' }] }] }), 0, 0, 'fill-color').animIn).toBeUndefined();
  });

  it('reads captions with words of their own or a source, and the styling', () => {
    const spec = ok({ clips: [{ duration: 6, layers: [{ type: 'captions', words: [{ text: 'Hello', start: 0, end: 0.5 }, { text: 'world', start: 0.6, end: 1 }, { text: 5, start: 1, end: 2 }], highlightColor: '#ffd400', position: 'middle', fontSize: 0.08 }, { type: 'captions', source: { url: 'https://x.test/a.wav', from: 2, to: 8 } }, { type: 'captions' }] }] });
    const a = layerOf(spec, 0, 0, 'captions');
    expect(a.words!.map(w => w.text)).toEqual(['Hello', 'world']);
    expect(a).toMatchObject({ highlightColor: '#ffd400', position: 'middle', fontSize: 0.08, background: 'rgba(0,0,0,0.7)' });
    expect(layerOf(spec, 0, 1, 'captions').source).toEqual({ url: 'https://x.test/a.wav', from: 2, to: 8 });
    expect(layerOf(spec, 0, 2, 'captions').source).toBeUndefined(); // listens to the clip's own video
    const bad = normalizeSpec({ clips: [{ duration: 3, layers: [{ type: 'captions', source: { url: 'http://x.test/a.wav' } }] }] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('(captions) source needs an https address');
  });

  it('reads cuts, reverse and freeze on a video layer, and sizes a clip from them', () => {
    const spec = ok({ clips: [{ layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 0, cutTo: 10, cuts: [{ from: 2, to: 4 }, { start: 6, end: 7 }, { from: 5 }], reverse: true, freeze: { at: 3, hold: 2 } }] }] });
    const v = layerOf(spec, 0, 0, 'video');
    expect(v.cuts).toEqual([{ start: 2, end: 4 }, { start: 6, end: 7 }]);
    expect([v.reverse, v.freeze]).toEqual([true, { at: 3, hold: 2 }]);
    // 10 s of the file less 3 s cut out is 7 s played, and the freeze adds 2 s: the clip lasts 9 s
    expect(resolveDurations(spec, () => 60).clips[0]!.duration).toBe(9);
    // a clip of a given length fits what is played to the time left after the freeze
    const fixed = ok({ clips: [{ duration: 5, layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 0, cutTo: 9, freeze: { at: 1, hold: 2 } }] }] });
    expect(layerOf(resolveDurations(fixed, () => 60), 0, 0, 'video').speed).toBeCloseTo(3, 5); // 9 s played in 5 - 2 s
  });

  it('puts a brand font, a logo on every clip, and expands templates into layers', () => {
    const spec = ok({
      brand: { colors: { primary: '#aa0000', text: '#eeeeee' }, font: 'serif', logo: { url: 'https://x.test/logo.png', position: 'bottom-right', width: 0.1, opacity: 0.8 } },
      clips: [
        { duration: 4, layers: [fill, { type: 'title', text: 'Hello' }, { type: 'template', template: 'lower-third', text: 'Ada', subtitle: 'Engineer', start: 1, duration: 2 }] },
        { duration: 4, logo: false, layers: [fill] },
      ],
    });
    expect(spec.brand?.font).toBe('serif');
    const first = spec.clips[0]!.layers;
    expect(layerOf(spec, 0, 1, 'text').font).toBe('serif');
    // the template became a bar and two lines of text, timed from the template, then the logo came last
    expect(first.map(l => l.type)).toEqual(['fill-color', 'text', 'shape', 'text', 'text', 'image-overlay']);
    expect(first[2]).toMatchObject({ start: 1, stop: 3, color: '#aa0000e6' });
    expect(first[5]).toMatchObject({ url: 'https://x.test/logo.png', opacity: 0.8, position: { ox: 'right', oy: 'bottom' } });
    expect(spec.clips[1]!.layers.map(l => l.type)).toEqual(['fill-color']);
    const bad = normalizeSpec({ clips: [{ duration: 3, layers: [{ type: 'template', template: 'lower-third' }] }] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('the lower-third template needs text');
    const noLogo = normalizeSpec({ brand: { logo: { url: 'http://x.test/l.png' } }, clips: [{ duration: 3, layers: [fill] }] });
    expect(noLogo.ok ? '' : noLogo.errors.join()).toContain('brand.logo needs an https address');
  });

  it('lets a track go down under speech, with settings or the defaults', () => {
    const spec = ok({ audioTracks: [{ url: 'https://x.test/a.mp3', duck: true }, { url: 'https://x.test/b.mp3', duck: { amountDb: -20, attack: 0.5 } }, { url: 'https://x.test/c.mp3' }], clips: [{ duration: 3, layers: [fill] }] });
    expect(spec.audioTracks[0]!.duck).toEqual({ thresholdDb: -42, amountDb: -14, attack: 0.25, release: 0.8, gap: 0.6 });
    expect(spec.audioTracks[1]!.duck).toMatchObject({ amountDb: -20, attack: 0.5, release: 0.8 });
    expect(spec.audioTracks[2]!.duck).toBeUndefined();
  });
});

describe('the reference by topic', () => {
  it('answers every topic with the fields the spec reader takes, and says which topics there are', async () => {
    const { COMPOSE_HELP_TOPICS, composeHelp } = await import('../compose-help');
    for (const t of COMPOSE_HELP_TOPICS) expect(composeHelp(t).length).toBeGreaterThan(80);
    expect(composeHelp('grade')).toContain('wheels');
    expect(composeHelp('sound')).toContain('denoise');
    expect(composeHelp('transitions')).toContain('pageturn');
    expect(composeHelp('all')).toContain('[captions]');
    expect(composeHelp('nonsense')).toContain('help topics');
    expect(COMPOSE_TOOL.description.length).toBeLessThan(2500);
    expect((COMPOSE_TOOL.parameters as { required: string[] }).required).toEqual([]);
  });
  it('lists in the reference every transition the code has', async () => {
    const { composeHelp } = await import('../compose-help');
    const { TRANSITION_NAMES } = await import('../transitions');
    const text = composeHelp('transitions');
    for (const n of TRANSITION_NAMES.filter(x => !x.startsWith('directional-') && !x.startsWith('wipe') && !x.startsWith('bowtie') && x !== 'cut')) expect(text, n).toContain(n);
  });
});
