/**
 * Normalize LLM math output into the step-by-step layout the frontend renders.
 */

export function normalizeMathResponse(text: string): string {
  let out = text.trim();

  // Strip markdown symbols that break the math parser
  out = out.replace(/^#{1,6}\s*/gm, '');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');

  // Ensure Step N lines are on their own paragraph
  out = out.replace(/(\S)\s+(Step\s+\d+)\b/gi, '$1\n\n$2');
  out = out.replace(/\b(Step\s+\d+)\s*[:.]?\s*/gi, '$1\n');
  out = out.replace(/\s+(Answer)\b/gi, '\n\n$1\n');
  out = out.replace(/\s+(Quick check)\b/gi, '\n\n$1\n');
  out = out.replace(/\s+(The bottom line)\b/gi, '\n\n$1\n');
  out = out.replace(/\s+(Your problem)\b/gi, '\n\n$1\n');
  out = out.replace(/(In plain words:?)\s*/gi, '$1\n\n');

  out = out.replace(/\n{4,}/g, '\n\n\n');
  return out.trim();
}
