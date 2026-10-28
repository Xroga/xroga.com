/** Fixed, uncompressed input prevents a tiny forged container from authorizing
 * hours of duration-billed speech. No decoder, subprocess or user metadata is
 * trusted. Five seconds of grace covers the existing 120-second capture timer.
 */
export function requireVoicePcm(audio: Buffer): {seconds: number; frames: number} {
  const invalid = () => new Error('A bounded PCM voice recording is required.');
  if (audio.length < 512 || audio.length > 8 * 1024 * 1024
    || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.readUInt32LE(4) !== audio.length - 8
    || audio.toString('ascii', 8, 12) !== 'WAVE' || audio.toString('ascii', 12, 16) !== 'fmt '
    || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1
    || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 22050
    || audio.readUInt32LE(28) !== 44100 || audio.readUInt16LE(32) !== 2
    || audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data'
    || audio.readUInt32LE(40) !== audio.length - 44 || (audio.length - 44) % 2 !== 0) throw invalid();
  const frames = (audio.length - 44) / 2, seconds = frames / 22050;
  if (seconds <= 0 || seconds > 125) throw invalid();
  return {seconds, frames};
}
