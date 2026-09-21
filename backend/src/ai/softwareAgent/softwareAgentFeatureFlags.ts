export interface SoftwareAgentFeatureFlags {
  enabled: boolean;
  shadowMode: boolean;
}

function envBoolean(
  value: string | undefined,
  fallback = false,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  ) {
    return true;
  }

  if (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'off'
  ) {
    return false;
  }

  return fallback;
}

export function getSoftwareAgentFeatureFlags():
  SoftwareAgentFeatureFlags {
  return {
    /**
     * Main kill switch.
     *
     * False by default so the legacy Builder remains active
     * until we explicitly enable the new agent path.
     */
    enabled: envBoolean(
      process.env.XROGA_SOFTWARE_AGENT_V2,
      false,
    ),

    /**
     * Shadow mode lets Xroga construct/observe the new path
     * without allowing it to replace the legacy user result.
     */
    shadowMode: envBoolean(
      process.env.XROGA_SOFTWARE_AGENT_V2_SHADOW,
      false,
    ),
  };
}

export function isSoftwareAgentV2Enabled():
  boolean {
  return getSoftwareAgentFeatureFlags()
    .enabled;
}

export function isSoftwareAgentV2ShadowMode():
  boolean {
  return getSoftwareAgentFeatureFlags()
    .shadowMode;
}
