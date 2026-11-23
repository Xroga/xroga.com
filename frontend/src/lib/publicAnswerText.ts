import { NATIVE_UI_MARKER, splitNativeOpenUiAnswer } from '../../../backend/src/ai/nativeOpenUi';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Nodes } from 'mdast';
import { isLegacyPublicSearchReview, savedSearchReviewLink, WEB_SEARCH_NOT_RUN, workspaceReviewId } from './connectedAppResult';

const presentationSyntax = /<<<XROGA_OPENUI|(?:\x60{3,}|~{3,})[ \t]*(?:openui(?:lang|-lang)?|xroga-ui|xroga-openui-v1|xroga-response-json-v1)\b|^ {0,3}root[ \t]*=[ \t]*[A-Z][A-Za-z0-9]*[ \t]*\(|"format"\s*:\s*"xroga-openui-v1"/im;

export function isPresentationLanguage(language?: string): boolean {
  return /^(?:openui(?:lang|-lang)?|xroga-ui|xroga-openui-v1|xroga-response-json-v1)$/i.test(language?.trim() ?? '');
}

/** Strip tagged presentation data while keeping ordinary Markdown code and prose. */
export function publicAnswerText(text: string, streaming = false): string {
  const markerTail = streaming && /<{1,3}[A-Z0-9_>]*[ \t]*$/u.exec(text)?.[0]?.trimEnd();
  const partialMarker = markerTail && NATIVE_UI_MARKER.trim().startsWith(markerTail);
  return presentationSyntax.test(text) || partialMarker ? splitNativeOpenUiAnswer(text, streaming).text : text;
}

/** Private action links stay available in Workspace and out of read-only exports. */
export function publicAnswerExportText(text: string): string {
  const prose = publicAnswerText(text);
  if (!/\/dashboard\/actions\/confirm\//i.test(prose)) return prose;
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const visit = (node: Nodes) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      if (node.type === 'paragraph') {
        const paragraph = prose.slice(start, end);
        const speaker = /^Xroga:[ \t]*\r?\n/.exec(paragraph)?.[0] ?? '';
        const body = paragraph.slice(speaker.length);
        if (savedSearchReviewLink(body)) {
          const notice = isLegacyPublicSearchReview(body) ? WEB_SEARCH_NOT_RUN : 'This search was awaiting review in Workspace.';
          replacements.push({ start, end, text: speaker + notice });
          return;
        }
      }
      if (node.type === 'link' && workspaceReviewId(node.url)) {
        replacements.push({ start, end, text: 'Review in Workspace' });
        return;
      }
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(unified().use(remarkParse).parse(prose));
  return replacements.reverse().reduce((result, { start, end, text: replacement }) =>
    result.slice(0, start) + replacement + result.slice(end), prose);
}
