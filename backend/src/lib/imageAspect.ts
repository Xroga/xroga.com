/** Map Xroga aspect formats to each image provider's size / ratio parameters */

import type { ImageAspectFormat } from '../services/builder/image/contentModeration.js';

export type ImageProviderOptions = {
  aspectFormat?: ImageAspectFormat;
};

export function falImageSize(format: ImageAspectFormat = '1:1'): string {
  const map: Record<ImageAspectFormat, string> = {
    '1:1': 'square_hd',
    '4:5': 'portrait_4_5',
    '16:9': 'landscape_16_9',
    '9:16': 'portrait_16_9',
    '3:4': 'portrait_4_3',
    '4:3': 'landscape_4_3',
  };
  return map[format] ?? 'square_hd';
}

export function replicateAspectRatio(format: ImageAspectFormat = '1:1'): string {
  return format;
}

export function geminiAspectRatio(format: ImageAspectFormat = '1:1'): string {
  return format;
}

export function agnesSize(format: ImageAspectFormat = '1:1'): string {
  const map: Record<ImageAspectFormat, string> = {
    '1:1': '1024x1024',
    '4:5': '1024x1280',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '3:4': '768x1024',
    '4:3': '1024x768',
  };
  return map[format] ?? '1024x1024';
}

export function openaiImageSize(format: ImageAspectFormat = '1:1'): '1024x1024' | '1792x1024' | '1024x1792' {
  if (format === '16:9' || format === '4:3') return '1792x1024';
  if (format === '9:16' || format === '3:4' || format === '4:5') return '1024x1792';
  return '1024x1024';
}

export function cloudflareDimensions(format: ImageAspectFormat = '1:1'): { width: number; height: number } {
  const map: Record<ImageAspectFormat, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '4:5': { width: 896, height: 1120 },
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '3:4': { width: 768, height: 1024 },
    '4:3': { width: 1024, height: 768 },
  };
  return map[format] ?? map['1:1'];
}
