// One quiet repair for a connected-app call that failed only because this task's own search did not list the tool.
//
// The provider's search varies from one call to the next, and a tool can also come from an earlier task, so the server sometimes answers
// "not discovered" for a tool that is perfectly fine. Rather than spend a model turn (or end the task), the call is repaired once:
// search again with the same words, then make the same call. The owner still approves the call on its own card, nothing else is retried,
// and a second failure is reported exactly as it was.
import type { PluginFailureKind } from './plugin-failures';

export type PluginToolName = 'plugin_search' | 'plugin_read' | 'plugin_action_search' | 'plugin_act';
export interface PluginResultLike {
  isError: boolean;
  failureKind?: PluginFailureKind;
}
export type PluginRunner<T extends PluginResultLike> = (name: PluginToolName, body: unknown) => Promise<T>;

export function repairingPluginCaller<T extends PluginResultLike>(run: PluginRunner<T>): PluginRunner<T> {
  const last: { read?: string; action?: string } = {};
  return async (name, body) => {
    const query = (body as { query?: unknown } | null)?.query;
    if ((name === 'plugin_search' || name === 'plugin_action_search') && typeof query === 'string') {
      last[name === 'plugin_search' ? 'read' : 'action'] = query;
    }
    const first = await run(name, body);
    if (!first.isError || first.failureKind !== 'search_again' || (name !== 'plugin_read' && name !== 'plugin_act')) return first;
    const words = name === 'plugin_read' ? last.read : last.action;
    if (!words) return first;
    // The server refuses an identical query twice, so the repeat is worded slightly differently.
    const again = await run(name === 'plugin_read' ? 'plugin_search' : 'plugin_action_search', { query: words.slice(0, 112) + ' (retry)' });
    if (again.isError) return first;
    const second = await run(name, body);
    return second.isError ? first : second;
  };
}
