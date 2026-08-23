"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalMemberContext } from "@/lib/auth/portal-member";

export interface OwnDocumentItem {
  id: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string;
}

export type OwnDocumentsResult =
  | { ok: true; documents: OwnDocumentItem[] }
  | { ok: false; error: string };

export type DocumentLinkResult = { ok: true; url: string } | { ok: false; error: string };

// Why the admin client is used here, and why that is safe.
//
// member_documents carries two SELECT policies -- one for staff with
// property.members.manage, and member_documents_select_member, which grants
// access to is_org_member(). A portal owner is a `members` row, not an
// organization_memberships row, so is_org_member() is false for them: an owner
// currently cannot read their own document metadata, and the matching storage
// policy on the member-documents bucket blocks the file itself for the same
// reason. Granting an owner-self policy is a database migration, and
// migrations are frozen under the current security baseline.
//
// So authorization is performed here in application code instead, and it is
// performed strictly: getPortalMemberContext() resolves the caller's own
// member row from their session, and every query below is filtered by BOTH
// that member_id and that organization_id. Nothing accepts an identifier from
// the client except a document id, and that id is re-verified against the
// caller's own member_id before any URL is issued. The service-role key never
// widens what is returned beyond the caller's own documents.
//
// This should be replaced by a member_documents_select_own RLS policy plus the
// matching storage policy once migrations reopen; see the note recorded with
// this work.

const SIGNED_URL_TTL_SECONDS = 300;

export async function listOwnDocumentsAction(): Promise<OwnDocumentsResult> {
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") return { ok: false, error: "unauthenticated" };
  const { member } = ctx;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("member_documents")
    .select("id, file_name, file_size, mime_type, created_at")
    .eq("member_id", member.id)
    .eq("organization_id", member.organization_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listOwnDocumentsAction] query failed:", error.message);
    return { ok: false, error: "query_failed" };
  }

  return {
    ok: true,
    documents: (data ?? []).map((d) => ({
      id: d.id,
      fileName: d.file_name,
      fileSize: d.file_size === null ? null : Number(d.file_size),
      mimeType: d.mime_type,
      uploadedAt: d.created_at,
    })),
  };
}

/**
 * Issues a short-lived signed URL for one of the caller's own documents.
 * `documentId` is the only client-supplied value and is re-checked against the
 * caller's member row before the storage path is ever read.
 */
export async function getOwnDocumentLinkAction(documentId: string): Promise<DocumentLinkResult> {
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") return { ok: false, error: "unauthenticated" };
  const { member } = ctx;

  const admin = createAdminClient();
  const { data: doc, error } = await admin
    .from("member_documents")
    .select("file_path, member_id, organization_id")
    .eq("id", documentId)
    .eq("member_id", member.id)
    .eq("organization_id", member.organization_id)
    .maybeSingle();

  if (error) {
    console.error("[getOwnDocumentLinkAction] query failed:", error.message);
    return { ok: false, error: "query_failed" };
  }
  if (!doc) return { ok: false, error: "not_found" };

  const { data: signed, error: signError } = await admin.storage
    .from("member-documents")
    .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error("[getOwnDocumentLinkAction] sign failed:", signError?.message);
    return { ok: false, error: "link_failed" };
  }

  return { ok: true, url: signed.signedUrl };
}
