import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getGateCompletionEnabled } from "@/lib/gates/completion-policy";
import { CompletionPolicyForm } from "./policy-form";

export default async function CompletionPolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await getCurrentUser();
  const org = user ? await getPrimaryOrganization(user.id) : null;
  if (!org) return null;
  const denied = await denyIfMissingPermission(org.id, "operations.gates.manage", locale);
  if (denied) return denied;
  const db = await createClient();
  return <CompletionPolicyForm enabled={await getGateCompletionEnabled(db, org.id)} isAr={locale === "ar"} />;
}
