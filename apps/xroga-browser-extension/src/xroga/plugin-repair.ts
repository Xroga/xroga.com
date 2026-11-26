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

/**
 * `changeTool` says whether a slug was offered by this run's change search. A read call for such a tool is refused as "not discovered"
 * (it is not a read tool, though a read-back often wants it, for example a values read the provider ranks as a change): searching again
 * for reads cannot list it, so the call goes through the guarded change route instead, with the same arguments (the owner's approval
 * rules for that route apply as usual).
 */
export function repairingPluginCaller<T extends PluginResultLike>(run: PluginRunner<T>, changeTool?: (slug: string) => boolean): PluginRunner<T> {
  const last: { read?: string; action?: string } = {};
  return async (name, body) => {
    const query = (body as { query?: unknown } | null)?.query;
    if ((name === 'plugin_search' || name === 'plugin_action_search') && typeof query === 'string') {
      last[name === 'plugin_search' ? 'read' : 'action'] = query;
    }
    const first = await run(name, body);
    if (!first.isError || first.failureKind !== 'search_again' || (name !== 'plugin_read' && name !== 'plugin_act')) return first;
    if (name === 'plugin_read' && changeTool) {
      const call = body as { slug?: unknown; arguments?: unknown } | null;
      if (typeof call?.slug === 'string' && changeTool(call.slug)) {
        const via = await run('plugin_act', { slug: call.slug, arguments: call.arguments ?? {}, request: ('Read back with ' + call.slug.toLowerCase().replace(/_/g, ' ')).slice(0, 200) });
        return via.isError ? first : via;
      }
    }
    const words = name === 'plugin_read' ? last.read : last.action;
    if (!words) return first;
    // The server refuses an identical query twice, so the repeat is worded slightly differently.
    const again = await run(name === 'plugin_read' ? 'plugin_search' : 'plugin_action_search', { query: words.slice(0, 112) + ' (retry)' });
    if (again.isError) return first;
    const second = await run(name, body);
    return second.isError ? first : second;
  };
}
