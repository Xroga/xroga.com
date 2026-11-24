import { describe, expect, it } from 'vitest';
import { emulationCommands } from '../emulate';

const methods = (a: Parameters<typeof emulationCommands>[0]) => emulationCommands(a).commands.map(c => c.method);

describe('emulationCommands', () => {
  it('turns a device preset into one metrics override with the preset size and mobile flag', () => {
    const { commands, summary } = emulationCommands({ device: 'iphone-15' });
    expect(commands).toEqual([{ method: 'Emulation.setDeviceMetricsOverride', params: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true } }]);
    expect(summary[0]).toContain('393x852');
  });

  it('lets an explicit size override the preset and defaults the missing side', () => {
    const { commands } = emulationCommands({ device: 'laptop', width: 1000 });
    expect(commands[0]!.params).toMatchObject({ width: 1000, height: 768, mobile: false });
    expect(emulationCommands({ width: 800 }).commands[0]!.params).toMatchObject({ width: 800, height: 800 });
  });

  it('puts scheme, motion and print into one emulated-media command', () => {
    const { commands } = emulationCommands({ colorScheme: 'dark', reducedMotion: true, media: 'print' });
    expect(commands).toEqual([
      { method: 'Emulation.setEmulatedMedia', params: { media: 'print', features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }] } },
    ]);
    expect(emulationCommands({ reducedMotion: false }).commands[0]!.params).toMatchObject({ features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  });

  it('maps network presets, CPU slowdown, time zone and language', () => {
    expect(emulationCommands({ network: 'offline' }).commands[0]!.params).toMatchObject({ offline: true });
    expect(emulationCommands({ network: 'slow-3g' }).commands[0]!.params).toMatchObject({ offline: false, latency: 2000 });
    expect(emulationCommands({ network: 'none' }).commands[0]!.params).toMatchObject({ offline: false, downloadThroughput: -1 });
    expect(methods({ cpuSlowdown: 4, timezone: 'Asia/Tokyo', locale: 'de-DE' })).toEqual(['Emulation.setCPUThrottlingRate', 'Emulation.setTimezoneOverride', 'Emulation.setLocaleOverride']);
  });

  it('reset clears every setting and ignores the others', () => {
    const { commands, summary } = emulationCommands({ reset: true, device: 'ipad', network: 'offline' });
    expect(commands.map(c => c.method)).toEqual([
      'Emulation.clearDeviceMetricsOverride', 'Emulation.setEmulatedMedia', 'Network.emulateNetworkConditions', 'Emulation.setCPUThrottlingRate', 'Emulation.setTimezoneOverride', 'Emulation.setLocaleOverride',
    ]);
    expect(commands[2]!.params).toMatchObject({ offline: false, downloadThroughput: -1, uploadThroughput: -1 });
    expect(commands[1]!.params).toMatchObject({ media: '', features: [{ name: 'prefers-color-scheme', value: '' }, { name: 'prefers-reduced-motion', value: '' }] });
    expect(summary).toEqual(['everything reset to the browser defaults']);
  });

  it('does nothing for an empty request', () => {
    expect(emulationCommands({}).commands).toEqual([]);
  });
});
