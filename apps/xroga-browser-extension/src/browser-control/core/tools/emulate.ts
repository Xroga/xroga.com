// `emulate`: how the open tab presents itself, for checking a site as a phone, in dark mode, in print, offline or on a slow connection, in another time zone or
// language. It changes only the tab's display and environment (never the site, never stored data) and `reset` undoes all of it; the debugger detaching at the end
// of a run clears it too. The settings follow Chrome DevTools' device, rendering and network emulation (chrome-devtools-mcp `emulate`, Playwright `browser_resize`).
import type { EmulateArgs } from '../../protocol/schemas';
import type { ToolContext, ToolOutcome } from '../controller';
import { withPageState } from './navigate';

export const DEVICES: Record<string, { width: number; height: number; scale: number; mobile: boolean }> = {
  'iphone-15': { width: 393, height: 852, scale: 3, mobile: true },
  'pixel-8': { width: 412, height: 915, scale: 2.625, mobile: true },
  ipad: { width: 820, height: 1180, scale: 2, mobile: true },
  laptop: { width: 1366, height: 768, scale: 1, mobile: false },
  desktop: { width: 1920, height: 1080, scale: 1, mobile: false },
};

/** Chrome DevTools' throttling presets: bytes per second and round-trip latency in milliseconds. */
export const NETWORKS: Record<string, { offline: boolean; latency: number; downloadThroughput: number; uploadThroughput: number }> = {
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
  'slow-3g': { offline: false, latency: 2000, downloadThroughput: 51_200, uploadThroughput: 51_200 },
  'fast-3g': { offline: false, latency: 562, downloadThroughput: 204_800, uploadThroughput: 94_208 },
  none: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
};

export interface Command {
  method: string;
  params: object;
}

/** The DevTools commands for the requested settings, and a plain description of each; pure so it can be tested without a browser. */
export function emulationCommands(args: EmulateArgs): { commands: Command[]; summary: string[] } {
  const commands: Command[] = [];
  const summary: string[] = [];
  if (args.reset) {
    commands.push(
      { method: 'Emulation.clearDeviceMetricsOverride', params: {} },
      // An empty value, not an empty list, is what clears a media feature.
      { method: 'Emulation.setEmulatedMedia', params: { media: '', features: [{ name: 'prefers-color-scheme', value: '' }, { name: 'prefers-reduced-motion', value: '' }] } },
      { method: 'Network.emulateNetworkConditions', params: { ...NETWORKS.none! } },
      { method: 'Emulation.setCPUThrottlingRate', params: { rate: 1 } },
      { method: 'Emulation.setTimezoneOverride', params: { timezoneId: '' } },
      { method: 'Emulation.setLocaleOverride', params: { locale: '' } },
    );
    summary.push('everything reset to the browser defaults');
    return { commands, summary };
  }
  const preset = args.device ? DEVICES[args.device] : undefined;
  const width = args.width ?? preset?.width;
  const height = args.height ?? preset?.height;
  if (width !== undefined || height !== undefined) {
    const w = width ?? preset?.width ?? 1280;
    const h = height ?? preset?.height ?? 800;
    const scale = args.scale ?? preset?.scale ?? 1;
    const mobile = args.mobile ?? preset?.mobile ?? false;
    commands.push({ method: 'Emulation.setDeviceMetricsOverride', params: { width: w, height: h, deviceScaleFactor: scale, mobile } });
    summary.push(`viewport ${w}x${h} at ${scale}x${mobile ? ', mobile' : ''}${args.device ? ` (${args.device})` : ''}`);
  }
  const features: { name: string; value: string }[] = [];
  if (args.colorScheme) {
    features.push({ name: 'prefers-color-scheme', value: args.colorScheme });
    summary.push(`${args.colorScheme} colour scheme`);
  }
  if (args.reducedMotion !== undefined) {
    features.push({ name: 'prefers-reduced-motion', value: args.reducedMotion ? 'reduce' : 'no-preference' });
    summary.push(args.reducedMotion ? 'reduced motion' : 'motion allowed');
  }
  if (features.length || args.media) {
    commands.push({ method: 'Emulation.setEmulatedMedia', params: { media: args.media === 'print' ? 'print' : '', features } });
    if (args.media === 'print') summary.push('print media');
  }
  if (args.network) {
    commands.push({ method: 'Network.emulateNetworkConditions', params: { ...NETWORKS[args.network]! } });
    summary.push(args.network === 'none' ? 'network throttling off' : `network ${args.network}`);
  }
  if (args.cpuSlowdown !== undefined) {
    commands.push({ method: 'Emulation.setCPUThrottlingRate', params: { rate: args.cpuSlowdown } });
    summary.push(args.cpuSlowdown === 1 ? 'CPU at full speed' : `CPU ${args.cpuSlowdown}x slower`);
  }
  if (args.timezone !== undefined) {
    commands.push({ method: 'Emulation.setTimezoneOverride', params: { timezoneId: args.timezone } });
    summary.push(args.timezone ? `time zone ${args.timezone}` : 'time zone back to the system');
  }
  if (args.locale !== undefined) {
    commands.push({ method: 'Emulation.setLocaleOverride', params: { locale: args.locale } });
    summary.push(args.locale ? `language ${args.locale}` : 'language back to the system');
  }
  return { commands, summary };
}

export async function emulate(ctx: ToolContext, args: EmulateArgs): Promise<ToolOutcome> {
  const { commands, summary } = emulationCommands(args);
  if (!commands.length) {
    return { data: { applied: [] }, lines: ['emulate · nothing to change: give a device or size, colorScheme, reducedMotion, media, network, cpuSlowdown, timezone, locale, or reset'] };
  }
  const attachment = await ctx.attach();
  const failed: string[] = [];
  if (commands.some(c => c.method.startsWith('Network.'))) await attachment.cdp.send(undefined, 'Network.enable').catch(() => undefined);
  for (const c of commands) {
    try {
      await attachment.cdp.send(undefined, c.method, c.params);
    } catch (e) {
      failed.push(`${c.method}: ${(e as Error).message?.slice(0, 120) ?? 'failed'}`);
    }
  }
  const lines = [`emulate · ${summary.join(' · ')}${failed.length ? ` · ${failed.length} not applied` : ''}`, ...failed.map(f => `  not applied: ${f}`)];
  if (!args.reset && !failed.length) lines.push('The tab keeps these settings until emulate with reset is called or the run ends. Reload or observe the page to see the effect.');
  return withPageState(ctx, 'none', { data: { applied: summary, failed }, lines });
}
