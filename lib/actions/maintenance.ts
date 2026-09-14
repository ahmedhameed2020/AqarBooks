"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const statusSchema = z.enum([
  "SUBMITTED",
  "TRIAGED",
  "IN_PROGRESS",
  "WAITING",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
]);
const visibilitySchema = z.enum(["STAFF_ONLY", "MEMBER_VISIBLE"]);
const attachmentKindSchema = z.enum(["ISSUE", "BEFORE", "AFTER", "INVOICE", "OTHER"]);
const attachmentMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const MAINTENANCE_ATTACHMENT_BUCKET = "maintenance-attachments";
const MAINTENANCE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAINTENANCE_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 300;

const createRequestSchema = z.object({
  unitId: z.string().uuid(),
  categoryId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(4000),
  priority: prioritySchema.default("NORMAL"),
});

const cancelRequestSchema = z.object({
  requestId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

const staffUpdateSchema = z.object({
  requestId: z.string().uuid(),
  nextStatus: statusSchema.optional(),
  categoryId: z.string().uuid().optional(),
  priority: prioritySchema.optional(),
  note: z.string().trim().max(1000).optional(),
  visibility: visibilitySchema.default("STAFF_ONLY"),
});

const beginAttachmentUploadSchema = z.object({
  requestId: z.string().uuid(),
  originalFileName: z.string().trim().min(1).max(180),
  mimeType: attachmentMimeSchema,
  byteSize: z.number().int().positive().max(MAINTENANCE_ATTACHMENT_MAX_BYTES),
  kind: attachmentKindSchema.default("ISSUE"),
  visibility: visibilitySchema.default("MEMBER_VISIBLE"),
});

const attachmentIdSchema = z.object({
  attachmentId: z.string().uuid(),
});

const nullableUuidSchema = z.string().uuid().optional().nullable();
const optionalDateTimeSchema = z.string().datetime({ offset: true }).optional().nullable();

const createWorkOrderSchema = z.object({
  requestId: z.string().uuid(),
  assignedUserId: nullableUuidSchema,
  supplierId: nullableUuidSchema,
  scheduledStartAt: optionalDateTimeSchema,
  scheduledEndAt: optionalDateTimeSchema,
  slaDueAt: optionalDateTimeSchema,
  note: z.string().trim().max(4000).optional(),
  visibility: visibilitySchema.default("STAFF_ONLY"),
});

const assignWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  assignedUserId: nullableUuidSchema,
  supplierId: nullableUuidSchema,
  note: z.string().trim().max(4000).optional(),
  visibility: visibilitySchema.default("STAFF_ONLY"),
});

const scheduleWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  scheduledStartAt: z.string().datetime({ offset: true }),
  scheduledEndAt: z.string().datetime({ offset: true }),
  slaDueAt: optionalDateTimeSchema,
  note: z.string().trim().max(4000).optional(),
  visibility: visibilitySchema.default("STAFF_ONLY"),
});

const workOrderTransitionSchema = z.object({
  workOrderId: z.string().uuid(),
  note: z.string().trim().max(4000).optional(),
  visibility: visibilitySchema.default("MEMBER_VISIBLE"),
});

const completeWorkOrderSchema = workOrderTransitionSchema.extend({
  completionSummary: z.string().trim().min(1).max(4000),
  memberVisibleSummary: z.string().trim().max(4000).optional(),
});

export type MaintenanceActionResult =
  | { ok: true; requestId?: string }
  | { ok: false; error: string };

export type WorkOrderActionResult =
  | { ok: true; workOrderId?: string }
  | { ok: false; error: string };

export type MaintenanceAttachmentUploadResult =
  | {
      ok: true;
      attachmentId: string;
      storagePath: string;
      signedUrl: string;
      token: string;
    }
  | { ok: false; error: string };

export type MaintenanceAttachmentLinkResult =
  | {
      ok: true;
      url: string;
      originalFileName: string;
      mimeType: string;
      byteSize: number;
    }
  | { ok: false; error: string };

function mapMaintenanceError(message: string | undefined): string {
  if (!message) return "failed";
  if (message.includes("MAINTENANCE_NOT_ENTITLED")) return "not_entitled";
  if (message.includes("UNIT_NOT_AUTHORIZED") || message.includes("REQUEST_NOT_AUTHORIZED")) return "forbidden";
  if (message.includes("INVALID_MAINTENANCE_TRANSITION")) return "invalid_transition";
  if (message.includes("CATEGORY_NOT_FOUND")) return "invalid_category";
  if (message.includes("REQUEST_NOT_FOUND")) return "not_found";
  if (message.includes("FORBIDDEN_MAINTENANCE_MANAGE")) return "forbidden";
  if (message.includes("NO_CHANGE")) return "no_change";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  return "failed";
}

function mapMaintenanceAttachmentError(message: string | undefined): string {
  if (!message) return "failed";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  if (message.includes("MAINTENANCE_NOT_ENTITLED")) return "not_entitled";
  if (
    message.includes("FORBIDDEN_MAINTENANCE_ATTACHMENT") ||
    message.includes("FORBIDDEN_MAINTENANCE_ATTACHMENT_KIND")
  ) return "forbidden";
  if (message.includes("REQUEST_NOT_FOUND") || message.includes("ATTACHMENT_NOT_FOUND")) return "not_found";
  if (message.includes("REQUEST_NOT_ACCEPTING_ATTACHMENTS")) return "request_closed";
  if (message.includes("INVALID_FILE_NAME")) return "invalid_file_name";
  if (message.includes("INVALID_FILE_SIZE") || message.includes("TOO_MANY_ATTACHMENTS")) return "invalid_file_size";
  if (message.includes("INVALID_MIME_TYPE")) return "invalid_mime_type";
  if (message.includes("INVALID_ATTACHMENT_KIND")) return "invalid_kind";
  if (message.includes("INVALID_VISIBILITY")) return "invalid_visibility";
  if (message.includes("ATTACHMENT_OBJECT_NOT_FOUND")) return "missing_object";
  if (message.includes("ATTACHMENT_SIZE_MISMATCH")) return "size_mismatch";
  if (message.includes("ATTACHMENT_MIME_MISMATCH")) return "mime_mismatch";
  if (message.includes("INVALID_ATTACHMENT_STATUS") || message.includes("READY_ATTACHMENT_IMMUTABLE")) return "invalid_status";
  return "failed";
}

function mapWorkOrderError(message: string | undefined): string {
  if (!message) return "failed";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  if (message.includes("MAINTENANCE_NOT_ENTITLED")) return "not_entitled";
  if (message.includes("WORK_ORDER_NOT_FOUND") || message.includes("REQUEST_NOT_FOUND")) return "not_found";
  if (message.includes("FORBIDDEN_WORK_ORDER")) return "forbidden";
  if (message.includes("INVALID_WORK_ORDER_TRANSITION")) return "invalid_transition";
  if (message.includes("INVALID_WORK_ORDER_SCHEDULE")) return "invalid_schedule";
  if (message.includes("INVALID_WORK_ORDER_ASSIGNEE") || message.includes("WORK_ORDER_ASSIGNEE_REQUIRED")) return "invalid_assignee";
  if (message.includes("INVALID_WORK_ORDER_SUPPLIER")) return "invalid_supplier";
  if (message.includes("COMPLETION_SUMMARY_REQUIRED")) return "completion_summary_required";
  if (message.includes("REQUEST_NOT_ACCEPTING_WORK_ORDERS")) return "request_closed";
  if (message.includes("INVALID_VISIBILITY")) return "invalid_visibility";
  return "failed";
}

export async function createMaintenanceRequestAction(
  input: z.input<typeof createRequestSchema>,
): Promise<MaintenanceActionResult> {
  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_maintenance_request", {
    p_unit_id: parsed.data.unitId,
    p_category_id: parsed.data.categoryId,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_priority: parsed.data.priority,
  });

  if (error || !data) {
    console.error("[createMaintenanceRequestAction] failed:", error?.message);
    return { ok: false, error: mapMaintenanceError(error?.message) };
  }

  revalidatePath("/[locale]/portal/maintenance", "page");
  revalidatePath("/[locale]/operations/maintenance", "page");
  return { ok: true, requestId: data };
}

export async function cancelOwnMaintenanceRequestAction(
  input: z.input<typeof cancelRequestSchema>,
): Promise<MaintenanceActionResult> {
  const parsed = cancelRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_own_maintenance_request", {
    p_request_id: parsed.data.requestId,
    p_note: parsed.data.note || null,
  });

  if (error) {
    console.error("[cancelOwnMaintenanceRequestAction] failed:", error.message);
    return { ok: false, error: mapMaintenanceError(error.message) };
  }

  revalidatePath("/[locale]/portal/maintenance", "page");
  revalidatePath("/[locale]/portal/maintenance/[requestId]", "page");
  return { ok: true };
}

export async function updateMaintenanceRequestStaffAction(
  input: z.input<typeof staffUpdateSchema>,
): Promise<MaintenanceActionResult> {
  const parsed = staffUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_maintenance_request_staff", {
    p_request_id: parsed.data.requestId,
    p_next_status: parsed.data.nextStatus || null,
    p_category_id: parsed.data.categoryId || null,
    p_priority: parsed.data.priority || null,
    p_note: parsed.data.note || null,
    p_visibility: parsed.data.visibility,
  });

  if (error) {
    console.error("[updateMaintenanceRequestStaffAction] failed:", error.message);
    return { ok: false, error: mapMaintenanceError(error.message) };
  }

  revalidatePath("/[locale]/operations/maintenance", "page");
  revalidatePath("/[locale]/operations/maintenance/[requestId]", "page");
  revalidatePath("/[locale]/portal/maintenance", "page");
  revalidatePath("/[locale]/portal/maintenance/[requestId]", "page");
  return { ok: true };
}

export async function beginMaintenanceAttachmentUploadAction(
  input: z.input<typeof beginAttachmentUploadSchema>,
): Promise<MaintenanceAttachmentUploadResult> {
  const parsed = beginAttachmentUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_maintenance_attachment_upload", {
    p_request_id: parsed.data.requestId,
    p_original_file_name: parsed.data.originalFileName,
    p_mime_type: parsed.data.mimeType,
    p_byte_size: parsed.data.byteSize,
    p_kind: parsed.data.kind,
    p_visibility: parsed.data.visibility,
  });

  const uploadIntent = data?.[0];
  if (error || !uploadIntent) {
    console.error("[beginMaintenanceAttachmentUploadAction] failed:", error?.message);
    return { ok: false, error: mapMaintenanceAttachmentError(error?.message) };
  }

  const { data: signedUpload, error: signedError } = await supabase.storage
    .from(MAINTENANCE_ATTACHMENT_BUCKET)
    .createSignedUploadUrl(uploadIntent.storage_path, { upsert: false });

  if (signedError || !signedUpload) {
    console.error("[beginMaintenanceAttachmentUploadAction] signed upload failed:", signedError?.message);
    await supabase.rpc("abort_maintenance_attachment_upload", {
      p_attachment_id: uploadIntent.attachment_id,
    });
    return { ok: false, error: "signed_upload_failed" };
  }

  return {
    ok: true,
    attachmentId: uploadIntent.attachment_id,
    storagePath: uploadIntent.storage_path,
    signedUrl: signedUpload.signedUrl,
    token: signedUpload.token,
  };
}

export async function finalizeMaintenanceAttachmentUploadAction(
  input: z.input<typeof attachmentIdSchema>,
): Promise<MaintenanceActionResult> {
  const parsed = attachmentIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_maintenance_attachment_upload", {
    p_attachment_id: parsed.data.attachmentId,
  });

  if (error) {
    console.error("[finalizeMaintenanceAttachmentUploadAction] failed:", error.message);
    await supabase.rpc("abort_maintenance_attachment_upload", {
      p_attachment_id: parsed.data.attachmentId,
    });
    return { ok: false, error: mapMaintenanceAttachmentError(error.message) };
  }

  revalidatePath("/[locale]/portal/maintenance/[requestId]", "page");
  revalidatePath("/[locale]/operations/maintenance/[requestId]", "page");
  return { ok: true };
}

export async function abortMaintenanceAttachmentUploadAction(
  input: z.input<typeof attachmentIdSchema>,
): Promise<MaintenanceActionResult> {
  const parsed = attachmentIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("abort_maintenance_attachment_upload", {
    p_attachment_id: parsed.data.attachmentId,
  });

  if (error) {
    console.error("[abortMaintenanceAttachmentUploadAction] failed:", error.message);
    return { ok: false, error: mapMaintenanceAttachmentError(error.message) };
  }

  return { ok: true };
}

export async function getMaintenanceAttachmentLinkAction(
  input: z.input<typeof attachmentIdSchema>,
): Promise<MaintenanceAttachmentLinkResult> {
  const parsed = attachmentIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data: attachment, error: attachmentError } = await supabase
    .from("maintenance_request_attachments")
    .select("id, original_file_name, storage_path, mime_type, byte_size, status")
    .eq("id", parsed.data.attachmentId)
    .eq("status", "READY")
    .maybeSingle();

  if (attachmentError || !attachment) {
    console.error("[getMaintenanceAttachmentLinkAction] metadata lookup failed:", attachmentError?.message);
    return { ok: false, error: attachmentError ? mapMaintenanceAttachmentError(attachmentError.message) : "not_found" };
  }

  const { data: signedDownload, error: signedError } = await supabase.storage
    .from(MAINTENANCE_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, MAINTENANCE_ATTACHMENT_SIGNED_URL_TTL_SECONDS, {
      download: attachment.original_file_name,
    });

  if (signedError || !signedDownload) {
    console.error("[getMaintenanceAttachmentLinkAction] signed URL failed:", signedError?.message);
    return { ok: false, error: mapMaintenanceAttachmentError(signedError?.message) };
  }

  return {
    ok: true,
    url: signedDownload.signedUrl,
    originalFileName: attachment.original_file_name,
    mimeType: attachment.mime_type,
    byteSize: attachment.byte_size,
  };
}

export async function createWorkOrderAction(
  input: z.input<typeof createWorkOrderSchema>,
): Promise<WorkOrderActionResult> {
  const parsed = createWorkOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_work_order", {
    p_maintenance_request_id: parsed.data.requestId,
    p_assigned_user_id: parsed.data.assignedUserId || null,
    p_supplier_id: parsed.data.supplierId || null,
    p_scheduled_start_at: parsed.data.scheduledStartAt || null,
    p_scheduled_end_at: parsed.data.scheduledEndAt || null,
    p_sla_due_at: parsed.data.slaDueAt || null,
    p_note: parsed.data.note || null,
    p_visibility: parsed.data.visibility,
  });

  if (error || !data) {
    console.error("[createWorkOrderAction] failed:", error?.message);
    return { ok: false, error: mapWorkOrderError(error?.message) };
  }

  revalidatePath("/[locale]/operations/maintenance", "page");
  revalidatePath("/[locale]/operations/maintenance/[requestId]", "page");
  revalidatePath("/[locale]/operations/maintenance/work-orders", "page");
  revalidatePath("/[locale]/portal/maintenance/[requestId]", "page");
  return { ok: true, workOrderId: data };
}

export async function assignWorkOrderAction(
  input: z.input<typeof assignWorkOrderSchema>,
): Promise<WorkOrderActionResult> {
  const parsed = assignWorkOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_work_order", {
    p_work_order_id: parsed.data.workOrderId,
    p_assigned_user_id: parsed.data.assignedUserId || null,
    p_supplier_id: parsed.data.supplierId || null,
    p_note: parsed.data.note || null,
    p_visibility: parsed.data.visibility,
  });

  if (error) {
    console.error("[assignWorkOrderAction] failed:", error.message);
    return { ok: false, error: mapWorkOrderError(error.message) };
  }

  revalidateWorkOrderPaths(parsed.data.workOrderId);
  return { ok: true };
}

export async function scheduleWorkOrderAction(
  input: z.input<typeof scheduleWorkOrderSchema>,
): Promise<WorkOrderActionResult> {
  const parsed = scheduleWorkOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_work_order", {
    p_work_order_id: parsed.data.workOrderId,
    p_scheduled_start_at: parsed.data.scheduledStartAt,
    p_scheduled_end_at: parsed.data.scheduledEndAt,
    p_sla_due_at: parsed.data.slaDueAt || null,
    p_note: parsed.data.note || null,
    p_visibility: parsed.data.visibility,
  });

  if (error) {
    console.error("[scheduleWorkOrderAction] failed:", error.message);
    return { ok: false, error: mapWorkOrderError(error.message) };
  }

  revalidateWorkOrderPaths(parsed.data.workOrderId);
  return { ok: true };
}

export async function startWorkOrderAction(input: z.input<typeof workOrderTransitionSchema>) {
  return transitionWorkOrderAction("start_work_order", input);
}

export async function waitWorkOrderAction(input: z.input<typeof workOrderTransitionSchema>) {
  return transitionWorkOrderAction("wait_work_order", input);
}

export async function resumeWorkOrderAction(input: z.input<typeof workOrderTransitionSchema>) {
  return transitionWorkOrderAction("resume_work_order", input);
}

export async function cancelWorkOrderAction(input: z.input<typeof workOrderTransitionSchema>) {
  return transitionWorkOrderAction("cancel_work_order", input);
}

export async function completeWorkOrderAction(
  input: z.input<typeof completeWorkOrderSchema>,
): Promise<WorkOrderActionResult> {
  const parsed = completeWorkOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_work_order", {
    p_work_order_id: parsed.data.workOrderId,
    p_completion_summary: parsed.data.completionSummary,
    p_member_visible_summary: parsed.data.memberVisibleSummary || null,
    p_note: parsed.data.note || null,
    p_visibility: parsed.data.visibility,
  });

  if (error) {
    console.error("[completeWorkOrderAction] failed:", error.message);
    return { ok: false, error: mapWorkOrderError(error.message) };
  }

  revalidateWorkOrderPaths(parsed.data.workOrderId);
  return { ok: true };
}

export async function addWorkOrderUpdateAction(
  input: z.input<typeof workOrderTransitionSchema>,
): Promise<WorkOrderActionResult> {
  const parsed = workOrderTransitionSchema.safeParse(input);
  if (!parsed.success || !parsed.data.note) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_work_order_update", {
    p_work_order_id: parsed.data.workOrderId,
    p_note: parsed.data.note,
    p_visibility: parsed.data.visibility,
  });

  if (error) {
    console.error("[addWorkOrderUpdateAction] failed:", error.message);
    return { ok: false, error: mapWorkOrderError(error.message) };
  }

  revalidateWorkOrderPaths(parsed.data.workOrderId);
  return { ok: true };
}

async function transitionWorkOrderAction(
  rpcName: "start_work_order" | "wait_work_order" | "resume_work_order" | "cancel_work_order",
  input: z.input<typeof workOrderTransitionSchema>,
): Promise<WorkOrderActionResult> {
  const parsed = workOrderTransitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc(rpcName, {
    p_work_order_id: parsed.data.workOrderId,
    p_note: parsed.data.note || null,
    p_visibility: parsed.data.visibility,
  });

  if (error) {
    console.error(`[${rpcName}] failed:`, error.message);
    return { ok: false, error: mapWorkOrderError(error.message) };
  }

  revalidateWorkOrderPaths(parsed.data.workOrderId);
  return { ok: true };
}

function revalidateWorkOrderPaths(workOrderId?: string) {
  void workOrderId;
  revalidatePath("/[locale]/operations/maintenance", "page");
  revalidatePath("/[locale]/operations/maintenance/[requestId]", "page");
  revalidatePath("/[locale]/operations/maintenance/work-orders", "page");
  revalidatePath("/[locale]/operations/maintenance/work-orders/[workOrderId]", "page");
  revalidatePath("/[locale]/portal/maintenance/[requestId]", "page");
}
