/** Legacy live-AI runtime injectors — retired no-ops for deploy helpers. */

export function ensureLiveAiScriptTag(html: string): string {
  return html;
}

export function liveAiProjectFiles(): Array<{ path: string; content: string }> {
  return [];
}

export function mergeLiveAiIntoJs(js: string): string {
  return js;
}

export function needsLiveAiRuntime(_prompt?: string): boolean {
  return false;
}

export function injectLiveAiRuntime(html: string): string {
  return html;
}

export function stripLiveAiRuntime(html: string): string {
  return html;
}

export function ensureLiveAiRuntimeFiles(
  files: Array<{ path: string; content: string }>
): Array<{ path: string; content: string }> {
  return files;
}
