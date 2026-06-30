/**
 * Credit Vault — tracks provider usage and degrades to OSS when budgets are low.
 * Budgets are per-process; env keys gate access.
 */

import { TOOL_REGISTRY, isToolConfigured } from './toolRegistry.js';

interface VaultBudget {
  /** Max units per day (chars, cents-equivalent, or request count) */
  dailyLimit: number;
  /** Cost per use in vault units */
  unitCost: number;
}

const VAULT_BUDGETS: Record<string, VaultBudget> = {
  elevenlabs: { dailyLimit: 10_000, unitCost: 50 },
  replicate: { dailyLimit: 2500, unitCost: 100 },
  fal: { dailyLimit: 1000, unitCost: 50 },
  deepgram: { dailyLimit: 20_000, unitCost: 10 },
  assemblyai: { dailyLimit: 5000, unitCost: 20 },
  runway: { dailyLimit: 500, unitCost: 200 },
  luma: { dailyLimit: 300, unitCost: 250 },
  kling: { dailyLimit: 400, unitCost: 150 },
  hailuo: { dailyLimit: 600, unitCost: 80 },
};

const usageLedger = new Map<string, number>();
let ledgerDay = new Date().toDateString();

function resetIfNewDay(): void {
  const today = new Date().toDateString();
  if (today !== ledgerDay) {
    usageLedger.clear();
    ledgerDay = today;
  }
}

export function recordVaultUsage(providerId: string, units = 1): void {
  resetIfNewDay();
  const budget = VAULT_BUDGETS[providerId];
  const cost = (budget?.unitCost ?? 10) * units;
  usageLedger.set(providerId, (usageLedger.get(providerId) ?? 0) + cost);
}

export function getVaultBalance(providerId: string): { used: number; limit: number; remaining: number } {
  resetIfNewDay();
  const budget = VAULT_BUDGETS[providerId];
  const limit = budget?.dailyLimit ?? 999_999;
  const used = usageLedger.get(providerId) ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export function isVaultDepleted(providerId: string): boolean {
  const tool = TOOL_REGISTRY.find((t) => t.id === providerId);
  if (!tool) return false;
  if (!isToolConfigured(tool)) return true;
  const { remaining } = getVaultBalance(providerId);
  return remaining <= 0;
}

/** Returns ordered providers with depleted premium tools filtered out */
export function filterByVault(providerIds: string[]): string[] {
  return providerIds.filter((id) => {
    const tool = TOOL_REGISTRY.find((t) => t.id === id);
    if (!tool?.isPremium) return true;
    return !isVaultDepleted(id);
  });
}

export function getCreditVaultStatus(): Record<string, { used: number; limit: number; remaining: number; configured: boolean }> {
  resetIfNewDay();
  const status: Record<string, { used: number; limit: number; remaining: number; configured: boolean }> = {};
  for (const id of Object.keys(VAULT_BUDGETS)) {
    const bal = getVaultBalance(id);
    status[id] = { ...bal, configured: isToolConfigured(TOOL_REGISTRY.find((t) => t.id === id) ?? { id, name: id, category: 'video', isFree: false, isPremium: false, costWeight: 1, capabilities: [] }) };
  }
  return status;
}
