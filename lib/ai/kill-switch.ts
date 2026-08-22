export type AiFeatureKey = 
  | "PLATFORM_GLOBAL"
  | "ASK_AQARBOOKS"
  | "INVOICE_OCR"
  | "JOURNAL_COPILOT"
  | "BANK_RECON_AI"
  | "SMART_DUNNING";

export const RELEASE_PROVENANCE = {
  modelProvider: "google_gemini",
  modelVersion: "gemini-2.5-flash",
  promptVersion: "p_ask_v1.4",
  toolRegistryVersion: "t_reg_v1.2",
  groundingEngineVersion: "ge_v1.0",
  deploymentSha: process.env.CF_PAGES_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "e5d11dc",
  buildDate: "2026-08-22",
} as const;

/**
 * 3-Tier Granular AI Kill Switch:
 * 1. Global Platform Switch
 * 2. Feature-Level Switch
 * 3. Tenant-Level Opt-out
 */
export function isAiFeatureEnabled(feature: AiFeatureKey, tenantSettings?: { aiDisabled?: boolean; disabledFeatures?: string[] }): boolean {
  // 1. Platform-level kill switch via environment variable
  if (process.env.AI_KILL_SWITCH_ALL === "true" || process.env.NEXT_PUBLIC_AI_KILL_SWITCH_ALL === "true") {
    return false;
  }

  // 2. Feature-level kill switch via environment variable
  const envKey = `AI_KILL_SWITCH_${feature}`;
  if (process.env[envKey] === "true") {
    return false;
  }

  // 3. Tenant-level opt-out
  if (tenantSettings) {
    if (tenantSettings.aiDisabled) return false;
    if (tenantSettings.disabledFeatures?.includes(feature)) return false;
  }

  return true;
}
