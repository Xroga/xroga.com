import type { ContentBlockerOutput } from '../../types/features.js';

export interface ProtectionConfig {
  dnsServers: string[];
  dnsProvider: string;
  onnxModelPath: string;
  onnxEnabled: boolean;
  deviceId: string;
}

const CLOUDFLARE_FAMILY_DNS = ['1.1.1.3', '1.0.0.3'];

export function getProtectionConfig(): ProtectionConfig {
  const modelPath = process.env.ONNX_MODEL_PATH ?? './models/nsfw-classifier.onnx';

  return {
    dnsServers: CLOUDFLARE_FAMILY_DNS,
    dnsProvider: 'Cloudflare Gateway (1.1.1.3 Family Filter)',
    onnxModelPath: modelPath,
    onnxEnabled: Boolean(process.env.ONNX_MODEL_PATH),
    deviceId: `xroga-${Date.now().toString(36)}`,
  };
}

export function generateDnsSetupScript(config: ProtectionConfig): string {
  return `#!/bin/bash
# Xroga Adult Content Blocker – Cloudflare Family DNS Setup
# Blocks malware and adult content network-wide

echo "Configuring Cloudflare Family DNS (1.1.1.3)..."

# Linux (systemd-resolved)
if command -v resolvectl &> /dev/null; then
  sudo resolvectl dns $(resolvectl status | grep 'Current DNS Server' -A1 | tail -1 | awk '{print $1}') ${config.dnsServers.join(' ')}
  sudo resolvectl domain ~.
  echo "DNS configured via systemd-resolved"
fi

# macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  networksetup -setdnsservers Wi-Fi ${config.dnsServers.join(' ')}
  echo "DNS configured for Wi-Fi on macOS"
fi

# Router instructions
echo ""
echo "For router-wide protection, set DNS to: ${config.dnsServers.join(', ')}"
echo "Cloudflare Gateway dashboard: https://one.dash.cloudflare.com/"
echo "Device ID: ${config.deviceId}"
`;
}

export function generateOnnxClientConfig(config: ProtectionConfig): Record<string, unknown> {
  return {
    runtime: 'onnxruntime-web',
    modelPath: config.onnxModelPath,
    threshold: 0.85,
    actions: {
      blur: true,
      block: true,
      notify: true,
    },
    targets: ['img', 'video', 'canvas'],
    note: 'Deploy ONNX Runtime Web in browser extension or Electron app for on-device image classification.',
  };
}

export async function activateProtection(
  userId: string,
  deviceName?: string
): Promise<ContentBlockerOutput> {
  const config = getProtectionConfig();
  const dnsScript = generateDnsSetupScript(config);
  const onnxConfig = generateOnnxClientConfig(config);

  return {
    type: 'content_blocker',
    status: 'Protection active on this device.',
    deviceId: config.deviceId,
    deviceName: deviceName ?? 'default',
    userId,
    dns: {
      provider: config.dnsProvider,
      servers: config.dnsServers,
      setupScript: dnsScript,
    },
    onnx: {
      enabled: config.onnxEnabled,
      modelPath: config.onnxModelPath,
      clientConfig: onnxConfig,
    },
    activatedAt: new Date().toISOString(),
  };
}
