/**
 * Pre-flight safety check on user-uploaded reference images before image-to-video.
 */

import { moderateImagePrompt } from '../../services/builder/image/contentModeration.js';
import { verifyImageQuick } from '../../services/builder/image/imageVerifier.js';
import { IMAGE_SAFETY_GUIDANCE } from '../../services/builder/image/imageSafetyMessages.js';

export interface UploadModerationResult {
  allowed: boolean;
  reason?: string;
}

export async function moderateUploadedImage(
  imageUrl: string,
  userPrompt: string
): Promise<UploadModerationResult> {
  const textCheck = moderateImagePrompt(userPrompt || 'animate this image');
  if (!textCheck.allowed) {
    return { allowed: false, reason: textCheck.reason };
  }

  try {
    const vision = await verifyImageQuick(
      imageUrl,
      `Uploaded reference image for animation. User request: ${userPrompt || 'turn image to video'}. Block nudity, bikini, lingerie, suggestive poses, adult content.`
    );
    if (vision.blockedForSafety) {
      return {
        allowed: false,
        reason: `${IMAGE_SAFETY_GUIDANCE.title}. ${IMAGE_SAFETY_GUIDANCE.quranReference}: "${IMAGE_SAFETY_GUIDANCE.quranTranslation}" This uploaded image cannot be used for video — please upload a modest, family-safe image.`,
      };
    }
  } catch (err) {
    console.warn('[UploadModeration] Vision check failed:', (err as Error).message);
  }

  return { allowed: true };
}
