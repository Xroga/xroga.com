import { splitNativeOpenUiAnswer } from '../../../backend/src/ai/nativeOpenUi';

const presentationSyntax = /<<<XROGA_OPENUI|(?:\x60{3,}|~{3,})[ \t]*(?:openui(?:lang|-lang)?|xroga-ui|xroga-openui-v1|xroga-response-json-v1)\b|^ {0,3}root[ \t]*=[ \t]*[A-Z][A-Za-z0-9]*[ \t]*\(|"format"\s*:\s*"xroga-openui-v1"/im;

export function isPresentationLanguage(language?: string): boolean {
  return /^(?:openui(?:lang|-lang)?|xroga-ui|xroga-openui-v1|xroga-response-json-v1)$/i.test(language?.trim() ?? '');
}

/** Strip tagged presentation data while keeping ordinary Markdown code and prose. */
export function publicAnswerText(text: string, streaming = false): string {
  const markerTail = streaming && text.slice(text.lastIndexOf("\n") + 1).trim();
  const partialMarker = markerTail && /^<{1,3}[A-Z0-9_]*$/.test(markerTail) && "<<<XROGA_OPENUI_V1>>>".startsWith(markerTail);
  return presentationSyntax.test(text) || partialMarker ? splitNativeOpenUiAnswer(text, streaming).text : text;
}
