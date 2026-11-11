// Plain-language rows of the activity block, built from the call's arguments and the layer's receipt. Page strings are
// kept as the layer quoted them («…») and rendered as text.
import type { ToolRow } from '@src/ui/protocol';
import { t } from '@src/ui/i18n';
import type { MessageKey } from '@src/ui/i18n';

interface LeanResult {
  ok?: boolean;
  error?: { code: string; message: string; hint?: string };
  receipt?: {
    target?: string;
    sensitive?: string;
    allowedBy?: 'user' | 'site-rule' | 'auto';
    effect?: { verdict: string; signals: string[] };
    navigation?: { url: string };
    downloads?: Array<{ name: string; url: string }>;
  };
  page?: { url: string; title: string };
  data?: Record<string, unknown>;
}

export interface ActivityLine {
  label: string;
  /** "no effect", "submit · allowed by you" and the like. */
  tags: string[];
  /** Detail lines: an address the agent wrote, requests seen during an unclassified action. */
  details: string[];
}

const LABELS: Record<string, MessageKey> = {
  snapshot: 'act.snapshot',
  find: 'act.find',
  screenshot: 'act.screenshot',
  wait: 'act.wait',
  click: 'act.click',
  set: 'act.set',
  type: 'act.type',
  press: 'act.press',
  hover: 'act.hover',
  scroll: 'act.scroll',
  handle_dialog: 'act.dialog',
  ask_user: 'act.ask',
  done: 'act.done',
  upload: 'act.upload',
  read_attachment: 'act.readAttachment',
  save_file: 'act.saveFile',
};

const ALLOWED: Record<string, MessageKey> = {
  user: 'act.allowedUser',
  'site-rule': 'act.allowedRule',
  auto: 'act.allowedAuto',
};

const LIVE_TOOL_LABELS = new Map<string, MessageKey>([
  ['snapshot', 'activity.inspecting'],
  ['find', 'activity.finding'],
  ['read', 'activity.reading'],
  ['screenshot', 'activity.capture'],
  ['click', 'activity.clicking'],
  ['set', 'activity.form'],
  ['type', 'activity.typing'],
  ['press', 'activity.keyboard'],
  ['hover', 'activity.inspecting'],
  ['scroll', 'activity.scrolling'],
  ['handle_dialog', 'activity.dialog'],
  ['fill_form', 'activity.form'],
  ['plugin_search', 'activity.pluginSearch'],
  ['plugin_read', 'activity.pluginRead'],
  ['read_attachment', 'activity.file'],
  ['upload', 'activity.uploading'],
  ['save_file', 'activity.saving'],
  ['wait', 'activity.pageWait'],
]);

/** Live labels describe what was dispatched, without guessing what the operation achieved. */
export function liveToolLabel(row: ToolRow): string {
  if (row.tool === 'navigate' || row.tool === 'tabs') {
    const args = row.args as { url?: unknown; action?: unknown } | undefined;
    if (row.tool === 'navigate' || args?.action === 'open') {
      if (typeof args?.url === 'string') {
        try {
          const { protocol, hostname } = new URL(args.url);
          if ((protocol === 'http:' || protocol === 'https:') && hostname) return t('activity.openingSite', { hostname });
        } catch {
          // Navigation without a valid host still has a browser action to report.
        }
      }
      return t('activity.navigating');
    }
    return t('activity.tabs');
  }
  return t(LIVE_TOOL_LABELS.get(row.tool) ?? 'activity.working');
}

/** Typed values are masked in what the panel shows, as in the audit log. */
export function maskArgs(args: unknown): unknown {
  if (!args || typeof args !== 'object') return args;
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const key of ['value', 'text', 'promptText']) {
    if (typeof out[key] === 'string') out[key] = t('act.typedLength', { count: (out[key] as string).length });
  }
  if (Array.isArray(out.fields)) {
    out.fields = (out.fields as Array<Record<string, unknown>>).map(f => ({
      ...f,
      value: typeof f.value === 'string' ? t('act.typedLength', { count: f.value.length }) : f.value,
    }));
  }
  return out;
}

export function activityLine(row: ToolRow): ActivityLine {
  const args = (row.tool.startsWith('plugin_') ? {} : row.args ?? {}) as Record<string, unknown>;
  const result = row.result as LeanResult | undefined;
  const receipt = result?.receipt;
  // The receipt's target without its ref: "[a2] button «Send»" reads as "button «Send»".
  const target = (receipt?.target ?? '').replace(/^\[[^\]]*\]\s*/, '');
  const tags: string[] = [];
  const details: string[] = [];
  let label: string;
  if (row.tool === 'plugin_search') {
    label = 'Find connected app tools';
  } else if (row.tool === 'plugin_read') {
    label = 'Read from connected app';
    if (typeof result?.data?.pluginReceiptId === 'string') details.push('Xroga receipt: ' + result.data.pluginReceiptId);
  } else if (row.tool === 'navigate') {
    const url = String(args.url ?? args.action ?? '');
    label = t('act.navigate', { url });
    // An address the agent wrote itself is marked as such.
    if (args.url) details.push(t('act.writtenByAgent'));
  } else if (row.tool === 'tabs') {
    const action = String(args.action ?? 'list');
    label =
      action === 'open'
        ? t('act.tabOpen', { url: String(args.url ?? '') })
        : action === 'close'
          ? t('act.tabClose', { tab: String(args.tabId ?? '') })
          : action === 'select'
            ? t('act.tabSelect', { tab: String(args.tabId ?? '') })
            : t('act.tabList');
    if (action === 'open' && args.url) details.push(t('act.writtenByAgent'));
  } else if (row.tool === 'fill_form') {
    const fields = Array.isArray(args.fields) ? args.fields.length : 0;
    label = t(args.submit ? 'act.fillSubmit' : 'act.fill', { count: fields });
  } else if (row.tool === 'press') {
    label = t('act.press', { keys: String(args.keys ?? '') });
  } else if (row.tool === 'opened') {
    // The outline the loop sent with the user's message when the run began, without the page's title.
    label = t('act.snapshot');
  } else if (row.tool === 'read') {
    label = t(args.ref ? 'act.readElement' : args.offset ? 'act.readMore' : 'act.read');
  } else if (row.tool === 'find') {
    label = t('act.find', { what: String(args.name ?? args.text ?? args.role ?? '') });
  } else {
    label = t(LABELS[row.tool] ?? 'act.other', { target, tool: row.tool, title: result?.page?.title ?? '' });
  }
  if (receipt?.effect?.verdict === 'none') tags.push(t('act.noEffect'));
  if (receipt?.sensitive) {
    tags.push(receipt.allowedBy ? `${receipt.sensitive} · ${t(ALLOWED[receipt.allowedBy])}` : receipt.sensitive);
  } else if (receipt) {
    // For an action that was not classified, the requests the layer saw, as a plain detail.
    for (const signal of receipt.effect?.signals ?? []) {
      const request = /^request: (\w+) «([^»]*)»/.exec(signal);
      if (request && request[1] !== 'GET') details.push(t('act.observed', { method: request[1], path: request[2] }));
    }
  }
  // Downloads the page began are reported, not held: the file's name and where it came from.
  for (const d of receipt?.downloads ?? []) {
    let from = d.url;
    try {
      from = /^(blob|data):/.test(d.url) ? t('act.fromPage') : new URL(d.url).host;
    } catch {
      // keep the raw address
    }
    details.push(t('act.downloaded', { name: d.name, from }));
  }
  if (result?.error) tags.push(result.error.code);
  return { label, tags, details };
}
