export function encodeVoicePcm(sampleRate: number, channels: readonly Float32Array[]): Uint8Array {
  if (!Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000
    || channels.length < 1 || channels.length > 8 || !channels[0]?.length
    || channels.some(channel => channel.length !== channels[0].length)
    || channels[0].length / sampleRate > 125) throw new Error('Voice recording exceeds the supported duration.');
  const rate = 22050, frames = Math.floor(channels[0].length * rate / sampleRate);
  if (frames < 234) throw new Error('No usable audio was received.');
  const result = new Uint8Array(44 + frames * 2), view = new DataView(result.buffer);
  const word = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) result[offset + i] = text.charCodeAt(i); };
  word(0, 'RIFF'); view.setUint32(4, result.length - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const position = i * sampleRate / rate, left = Math.floor(position), right = Math.min(left + 1, channels[0].length - 1), fraction = position - left;
    let sample = 0;
    for (const channel of channels) sample += channel[left] * (1 - fraction) + channel[right] * fraction;
    sample /= channels.length;
    if (!Number.isFinite(sample)) throw new Error('Invalid voice samples.');
    sample = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return result;
}

export async function normalizeVoiceAudio(audio: Blob): Promise<Blob> {
  if (audio.size < 512 || audio.size > 8 * 1024 * 1024) throw new Error('Invalid voice recording size.');
  if (typeof OfflineAudioContext === 'undefined') throw new Error('This browser cannot prepare secure voice recordings.');
  const context = new OfflineAudioContext(1, 1, 22050);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const decoded = await Promise.race([
      context.decodeAudioData(await audio.arrayBuffer()),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Voice preparation timed out.')), 15000); }),
    ]);
    const channels = Array.from({length: decoded.numberOfChannels}, (_, index) => decoded.getChannelData(index));
    return new Blob([new Uint8Array(encodeVoicePcm(decoded.sampleRate, channels))], {type: 'audio/wav'});
  } finally { if (timer) clearTimeout(timer); }
}
