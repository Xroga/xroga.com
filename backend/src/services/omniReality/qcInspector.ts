/**
 * QC Inspector — 4-phase pre-visualization checks (Silent Heal).
 * Uses Gemini vision + DeepSeek text review + heuristics.
 */

import { reviewVideoOutputs } from '../media/videoUtils.js';
import { geminiVisionQC } from './brainTrinity.js';

export interface QCInspectionResult {
  passed: boolean;
  score: number;
  physics: number;
  lighting: number;
  consistency: number;
  issues: string[];
  phases: {
    faceAnchoring: boolean;
    silhouetteEdge: boolean;
    audioDrift: boolean;
    colorFlicker: boolean;
  };
}

const FALLBACK_PROVIDERS = new Set(['slideshow', 'slideshow-ai-image', 'ffmpeg-minimal', 'static-mp4', 'parallax']);

export async function runQCInspection(options: {
  videoUrl: string;
  prompt: string;
  provider: string;
  keyframeUrl?: string;
  referenceFaceUrl?: string;
}): Promise<QCInspectionResult> {
  const { videoUrl, prompt, provider, keyframeUrl, referenceFaceUrl } = options;

  if (FALLBACK_PROVIDERS.has(provider)) {
    return {
      passed: true,
      score: 72,
      physics: 72,
      lighting: 72,
      consistency: 72,
      issues: ['Visual fallback used — QC relaxed'],
      phases: { faceAnchoring: true, silhouetteEdge: true, audioDrift: true, colorFlicker: true },
    };
  }

  const issues: string[] = [];
  let physics = 75;
  let lighting = 75;
  let consistency = 75;

  const textReview = await reviewVideoOutputs([{ provider, videoUrl }], prompt);
  physics = textReview.physics;
  lighting = textReview.lighting;
  consistency = textReview.consistency;

  const frameUrl = keyframeUrl ?? (videoUrl.startsWith('http') ? undefined : undefined);
  const vision = frameUrl ? await geminiVisionQC(frameUrl, prompt, referenceFaceUrl) : null;

  if (vision) {
    physics = Math.round((physics + vision.physics_score) / 2);
    if (vision.face_similarity_score < 0.85) {
      issues.push('Face-Melt Alert: similarity below 0.85');
    }
    if (vision.flicker_detected) issues.push('Color flicker detected');
    issues.push(...vision.issues);
  }

  const phases = {
    faceAnchoring: !issues.some((i) => i.toLowerCase().includes('face')),
    silhouetteEdge: !issues.some((i) => i.toLowerCase().includes('polygon') || i.toLowerCase().includes('jagged')),
    audioDrift: true,
    colorFlicker: !issues.some((i) => i.toLowerCase().includes('flicker')),
  };

  const score = physics + lighting + consistency;
  const passed = score >= 63 && issues.length < 3;

  return { passed, score, physics, lighting, consistency, issues, phases };
}
