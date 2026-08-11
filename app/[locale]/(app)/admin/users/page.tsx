import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/routing";
import { InviteMemberForm } from "./invite-member-form";

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();
  const [{ data: memberships }, { data: roles }, { data: assignments }] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("user_id, status, created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("roles")
      .select("id, key, name_ar, name_en")
      .eq("organization_id", organization.id)
      .order("name_en"),
    supabase
      .from("user_role_assignments")
      .select("user_id, role_id")
      .eq("organization_id", organization.id),
  ]);

  const roleNameById = new Map(
    (roles ?? []).map((r) => [r.id, { key: r.key, name_ar: r.name_ar, name_en: r.name_en }]),
  );

  const roleByUser = new Map<string, string>();
  for (const a of assignments ?? []) {
    const role = roleNameById.get(a.role_id);
    if (role) roleByUser.set(a.user_id, isAr ? role.name_ar : role.name_en);
  }

  const adminClient = createAdminClient();
  const emailByUser = new Map<string, string>();
  await Promise.all(
    (memberships ?? []).map(async (m) => {
      const { data } = await adminClient.auth.admin.getUserById(m.user_id);
      if (data.user?.email) emailByUser.set(m.user_id, data.user.email);
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "المستخدمون" : "Users"}</h1>
      </div>
      <InviteMemberForm organizationId={organization.id} roles={roles ?? []} locale={locale} />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "البريد" : "Email"}</TableHead>
              <TableHead>{isAr ? "الدور" : "Role"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberships?.length ? (
              memberships.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell className="font-medium">
                    {emailByUser.get(m.user_id) ?? m.user_id}
                  </TableCell>
                  <TableCell>{roleByUser.get(m.user_id) ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{m.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {isAr ? "لا يوجد مستخدمون بعد" : "No users yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
