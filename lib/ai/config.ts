export const AI_CONFIG = {
  // Provider and Gateway routing
  gatewayUrl: process.env.CLOUDFLARE_AI_GATEWAY_URL || process.env.AI_GATEWAY_URL || null,
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
  
  // Model routing defaults (Current 2026/2027 stable tier models)
  models: {
    fast: process.env.AI_MODEL_FAST || "gemini-2.5-flash",
    reasoning: process.env.AI_MODEL_REASONING || "gemini-2.5-pro",
    multimodal: process.env.AI_MODEL_MULTIMODAL || "gemini-2.5-flash",
  },
  
  // Safety & Guardrail defaults
  maxTokens: 2048,
  timeoutMs: 15000,
  defaultTemperature: 0.1, // Low temperature for accounting/deterministic extraction
} as const;

export type AiTaskType = "IMPORT_MAPPING" | "FINANCIAL_NARRATIVE" | "SMART_DUNNING" | "INVOICE_OCR" | "BANK_MATCHING";
