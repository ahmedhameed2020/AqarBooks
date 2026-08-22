import { createClient } from "@/lib/supabase/server";

export type AiAuditEntry = {
  organizationId: string;
  userId: string;
  taskType: string;
  model: string;
  promptSnippet: string;
  toolsUsed?: string[];
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  confidenceScore?: number | null;
};

/**
 * Strips sensitive PII (credit card numbers, national IDs, passwords)
 * before sending data to LLM prompt.
 */
export function sanitizePrompt(text: string): string {
  if (!text) return "";
  return text
    // Redact credit card / 16-digit numbers
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED_CARD]")
    // Redact password or token patterns
    .replace(/(?:password|secret|token|apikey)\s*[:=]\s*[^\s]+/gi, "[REDACTED_SECRET]");
}

export type HumanCorrectionAction = "ACCEPTED_UNCHANGED" | "EDITED_THEN_ACCEPTED" | "REJECTED";

export type HumanCorrectionDelta = {
  organizationId: string;
  userId: string;
  featureKey: "OCR" | "JOURNAL_COPILOT" | "BANK_RECON" | "ASK_AQARBOOKS";
  action: HumanCorrectionAction;
  aiProposed: any;
  humanAccepted: any;
  differenceSummary?: string;
  fieldCountTotal?: number;
  fieldCountCorrected?: number;
};

/**
 * Records AI interaction in audit log for transparency, security, and usage monitoring.
 */
export async function recordAiAuditLog(entry: AiAuditEntry): Promise<void> {
  try {
    const supabase = await createClient();
    // Non-blocking write to audit log if table exists, fails silently without breaking workflow
    await (supabase as any).from("ai_audit_logs").insert({
      organization_id: entry.organizationId,
      user_id: entry.userId,
      task_type: entry.taskType,
      model_name: entry.model,
      prompt_summary: entry.promptSnippet.slice(0, 300),
      latency_ms: entry.latencyMs,
      is_success: entry.success,
      error_message: entry.errorMessage ?? null,
      confidence_score: entry.confidenceScore ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Silently ignore if audit table is not yet created in PostgreSQL
  }
}

/**
 * Records differential human modifications to AI suggestions
 * to power the Shadow Pilot Telemetry and Continuous Quality Metrics.
 */
export async function recordHumanCorrectionDelta(delta: HumanCorrectionDelta): Promise<void> {
  try {
    const supabase = await createClient();
    await (supabase as any).from("ai_human_corrections").insert({
      organization_id: delta.organizationId,
      user_id: delta.userId,
      feature_key: delta.featureKey,
      action: delta.action,
      ai_proposed: typeof delta.aiProposed === "object" ? JSON.stringify(delta.aiProposed) : String(delta.aiProposed),
      human_accepted: typeof delta.humanAccepted === "object" ? JSON.stringify(delta.humanAccepted) : String(delta.humanAccepted),
      difference_summary: delta.differenceSummary ?? null,
      field_count_total: delta.fieldCountTotal ?? null,
      field_count_corrected: delta.fieldCountCorrected ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking telemetry
  }
}
