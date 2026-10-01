import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getGateLongStayPolicy, type PolicyClient } from "@/lib/gates/long-stay-policy";
import { LongStayPolicyForm } from "./policy-form";

export default async function LongStayPolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await getCurrentUser();
  const org = user ? await getPrimaryOrganization(user.id) : null;
  if (!org) return null;
  const denied = await denyIfMissingPermission(org.id, "operations.gates.manage", locale);
  if (denied) return denied;
  const db = await createClient();
  const policy = await getGateLongStayPolicy(db as unknown as PolicyClient, org.id);
  return <LongStayPolicyForm {...policy} isAr={locale === "ar"} />;
}
