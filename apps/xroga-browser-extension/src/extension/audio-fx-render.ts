// Applies the sound treatment of src/agent/audio-fx.ts to a decoded sound in the offscreen document: noise reduction first (on the samples), then the filters, equaliser, compressor, echo and
// reverb through an offline audio graph, then the level. The graph is the Web Audio one the browser has; nothing is downloaded.
import { NOISE_FOCUS, fxTail, impulseResponse, spectralDenoise, type AudioFx, type EqBand } from '@src/agent/audio-fx';

export async function applyFx(input: AudioBuffer, fx: AudioFx): Promise<AudioBuffer> {
  const rate = input.sampleRate;
  const channels = input.numberOfChannels;
  let source = input;
  const post: EqBand[] = [];
  if (fx.denoise) {
    const focus = NOISE_FOCUS[fx.denoise.focus];
    const cleaned = new AudioBuffer({ length: input.length, numberOfChannels: channels, sampleRate: rate });
    for (let k = 0; k < channels; k++) {
      const out = spectralDenoise(input.getChannelData(k), rate, { amount: fx.denoise.amount, floor: focus.floor, noiseFrom: fx.denoise.noiseFrom, noiseSeconds: fx.denoise.noiseSeconds });
      cleaned.copyToChannel(out as Float32Array<ArrayBuffer>, k);
    }
    source = cleaned;
    post.push(...focus.post);
  }
  const needsGraph = post.length > 0 || fx.highpass || fx.lowpass || fx.eq || fx.compressor || fx.reverb || fx.delay || fx.gain;
  if (!needsGraph) return source;
  const tail = fxTail(fx);
  const length = source.length + Math.round(tail * rate);
  const ctx = new OfflineAudioContext(Math.max(2, channels), length, rate);
  const src = ctx.createBufferSource();
  src.buffer = source;
  let node: AudioNode = src;
  const chain = (next: AudioNode) => {
    node.connect(next);
    node = next;
  };
  const filter = (b: EqBand) => {
    const f = ctx.createBiquadFilter();
    f.type = b.type;
    f.frequency.value = Math.min(b.frequency, rate / 2 - 100);
    f.gain.value = b.gain;
    f.Q.value = b.q;
    chain(f);
  };
  if (fx.highpass) filter({ type: 'highpass', frequency: fx.highpass, gain: 0, q: 0.707 });
  if (fx.lowpass) filter({ type: 'lowpass', frequency: fx.lowpass, gain: 0, q: 0.707 });
  for (const b of post) filter(b);
  for (const b of fx.eq ?? []) filter(b);
  if (fx.compressor) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = fx.compressor.threshold;
    c.ratio.value = fx.compressor.ratio;
    c.attack.value = fx.compressor.attack;
    c.release.value = fx.compressor.release;
    c.knee.value = fx.compressor.knee;
    chain(c);
    if (fx.compressor.makeup) {
      const m = ctx.createGain();
      m.gain.value = Math.pow(10, fx.compressor.makeup / 20);
      chain(m);
    }
  }
  if (fx.delay) {
    const mix = ctx.createGain();
    const delay = ctx.createDelay(2);
    const feedback = ctx.createGain();
    const wet = ctx.createGain();
    delay.delayTime.value = fx.delay.time;
    feedback.gain.value = fx.delay.feedback;
    wet.gain.value = fx.delay.wet;
    node.connect(mix);
    node.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(mix);
    node = mix;
  }
  if (fx.reverb) {
    const room = fx.reverb;
    const mix = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const conv = ctx.createConvolver();
    const ir = impulseResponse(rate, room.roomSize, room.damping);
    const impulse = ctx.createBuffer(2, ir[0]!.length, rate);
    impulse.copyToChannel(ir[0]! as Float32Array<ArrayBuffer>, 0);
    impulse.copyToChannel(ir[1]! as Float32Array<ArrayBuffer>, 1);
    conv.buffer = impulse;
    // the room is quiet by itself: scale it to what a person expects of "wet"
    dry.gain.value = room.dry;
    wet.gain.value = room.wet * 0.12;
    node.connect(dry);
    dry.connect(mix);
    if (room.preDelay > 0) {
      const pre = ctx.createDelay(0.2);
      pre.delayTime.value = room.preDelay / 1000;
      node.connect(pre);
      pre.connect(conv);
    } else node.connect(conv);
    conv.connect(wet);
    wet.connect(mix);
    node = mix;
  }
  if (fx.gain) {
    const g = ctx.createGain();
    g.gain.value = Math.pow(10, fx.gain / 20);
    chain(g);
  }
  node.connect(ctx.destination);
  src.start(0);
  const rendered = await ctx.startRendering();
  // the same number of channels as the input, so mixing downstream is unchanged
  if (rendered.numberOfChannels === channels) return rendered;
  const out = new AudioBuffer({ length: rendered.length, numberOfChannels: channels, sampleRate: rate });
  for (let k = 0; k < channels; k++) out.copyToChannel(rendered.getChannelData(Math.min(k, rendered.numberOfChannels - 1)) as Float32Array<ArrayBuffer>, k);
  return out;
}
