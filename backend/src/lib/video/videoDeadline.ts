/** Hard wall-clock deadline for video production — never leave users on infinite progress */

export const FAST_CLIP_DEADLINE_MS = 100_000;
export const STANDARD_VIDEO_DEADLINE_MS = 300_000;

export function videoDeadlineMs(durationSeconds: number): number {
  return durationSeconds <= 15 ? FAST_CLIP_DEADLINE_MS : STANDARD_VIDEO_DEADLINE_MS;
}

export async function withVideoDeadline<T>(
  promise: Promise<T>,
  ms: number,
  label = 'video-production'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} deadline exceeded (${ms}ms)`)), ms)
    ),
  ]);
}
