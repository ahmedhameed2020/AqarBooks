import { setRequestLocale } from "next-intl/server";
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
import type { Locale } from "@/i18n/routing";

export default async function RolesPage({
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
  const { data: roles } = await supabase
    .from("roles")
    .select("id, key, name_ar, name_en")
    .eq("organization_id", organization.id)
    .order("name_en");

  const roleIds = (roles ?? []).map((r) => r.id);
  const permissionCountByRole = new Map<string, number>();
  if (roleIds.length) {
    const { data: rolePermissions } = await supabase
      .from("role_permissions")
      .select("role_id")
      .in("role_id", roleIds);
    for (const rp of rolePermissions ?? []) {
      permissionCountByRole.set(rp.role_id, (permissionCountByRole.get(rp.role_id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "الأدوار" : "Roles"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "أدوار مستنسخة من قالب المنصة عند إنشاء المنظمة. تعديل الصلاحيات يأتي لاحقًا."
            : "Cloned from the platform template at org creation. Editing grants ships later."}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الدور" : "Role"}</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>{isAr ? "عدد الصلاحيات" : "Permissions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles?.length ? (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    {isAr ? role.name_ar : role.name_en}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {role.key}
                  </TableCell>
                  <TableCell>{permissionCountByRole.get(role.id) ?? 0}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
