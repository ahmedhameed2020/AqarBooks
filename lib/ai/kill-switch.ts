export type AiFeatureKey = 
  | "PLATFORM_GLOBAL"
  | "ASK_AQARBOOKS"
  | "INVOICE_OCR"
  | "JOURNAL_COPILOT"
  | "BANK_RECON_AI"
  | "SMART_DUNNING";

export type AiIncidentSeverity = 
  | "AI_0_CRITICAL"   // Cross-tenant leak, unauthorized financial write, security breach
  | "AI_1_HIGH"       // Erroneous financial figure or hazardous matching intercepted before posting
  | "AI_2_MEDIUM"     // Incorrect tool / entity resolved, corrected by human
  | "AI_3_LOW";       // Weak phrasing, latency, minor UX polish

export type OperationalKillSwitchState = {
  feature: AiFeatureKey;
  isEnabled: boolean;
  changedBy: string;
  changedAt: string;
  reason: string;
};

export const RELEASE_PROVENANCE = {
  bundleId: "CERT-2026-08-A",
  modelProvider: "google_gemini",
  baselineModel: "gemini-2.5-flash",
  candidateModel: "gemini-3.7-flash",
  promptVersion: "p_ask_v1.4",
  toolRegistryVersion: "t_reg_v1.2",
  groundingEngineVersion: "ge_v1.0",
  deploymentSha: process.env.CF_PAGES_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "c2e4770",
  buildDate: "2026-08-22",
  validationStatus: "PRE_PRODUCTION_CERTIFIED", // 🟡 Pre-Production Certified -> 🟢 Production Validated
} as const;

/**
 * Formal Policy on what triggers a Certification Bundle bump vs Cosmetic deploy.
 * - Material changes create a fresh bundle ID (e.g. CERT-2026-08-B) and reset sample telemetry.
 * - Cosmetic UI/CSS/i18n changes retain the active certification bundle.
 */
export const PREDEFINED_EVALUATION_CHECKPOINTS = {
  description: "Fixed evaluation checkpoints to prevent repeated-peeking / optional-stopping bias. Production validation decisions are strictly evaluated only at these fixed sample sizes.",
  checkpoints: {
    BANK_RECON: [200, 300, 400, 500],
    ASK_AQARBOOKS: [150, 250, 350, 450],
    INVOICE_OCR: [500, 750, 1000],
    JOURNAL_COPILOT: [100, 200, 300],
  },
} as const;

export const CERTIFICATION_RELEVANT_CHANGE_POLICY = {
  triggersBundleReset: [
    "AI Model / Provider switch",
    "System Prompt / Instruction revisions",
    "Tool registry schemas, parameters, or RPC bindings",
    "Entity resolver heuristics & matching algorithms",
    "Deterministic grounding validation rules",
    "Accounting subledger guard logic",
  ],
  retainsCurrentBundle: [
    "Pure UI / CSS / Layout adjustments",
    "i18n translation labels & typo fixes",
    "Sidebar / Navigation re-ordering",
    "Non-AI frontend components",
  ],
} as const;

// In-memory operational kill switches (immediate runtime toggles without redeploy)
const operationalSwitches = new Map<AiFeatureKey, OperationalKillSwitchState>();

/**
 * 3-Tier Granular AI Kill Switch:
 * 1. Global Platform Switch (Environment + Runtime Map)
 * 2. Feature-Level Switch
 * 3. Tenant-Level Opt-out
 */
export function isAiFeatureEnabled(
  feature: AiFeatureKey,
  tenantSettings?: { aiDisabled?: boolean; disabledFeatures?: string[] }
): boolean {
  // 1. Check in-memory operational runtime overrides
  const globalRuntime = operationalSwitches.get("PLATFORM_GLOBAL");
  if (globalRuntime && !globalRuntime.isEnabled) return false;

  const featureRuntime = operationalSwitches.get(feature);
  if (featureRuntime && !featureRuntime.isEnabled) return false;

  // 2. Platform-level kill switch via environment variable
  if (process.env.AI_KILL_SWITCH_ALL === "true" || process.env.NEXT_PUBLIC_AI_KILL_SWITCH_ALL === "true") {
    return false;
  }

  // 3. Feature-level kill switch via environment variable
  const envKey = `AI_KILL_SWITCH_${feature}`;
  if (process.env[envKey] === "true") {
    return false;
  }

  // 4. Tenant-level opt-out
  if (tenantSettings) {
    if (tenantSettings.aiDisabled) return false;
    if (tenantSettings.disabledFeatures?.includes(feature)) return false;
  }

  return true;
}

/**
 * Audited operational toggle for fast incident mitigation.
 */
export function toggleOperationalKillSwitch(params: {
  feature: AiFeatureKey;
  isEnabled: boolean;
  changedBy: string;
  reason: string;
}): OperationalKillSwitchState {
  const state: OperationalKillSwitchState = {
    feature: params.feature,
    isEnabled: params.isEnabled,
    changedBy: params.changedBy,
    changedAt: new Date().toISOString(),
    reason: params.reason,
  };

  operationalSwitches.set(params.feature, state);
  return state;
}
