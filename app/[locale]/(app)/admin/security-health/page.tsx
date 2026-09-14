import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Info,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { SecurityHealthSnapshotActions } from "./security-health-snapshot-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthStatus = "healthy" | "attention" | "critical" | "info";

type HealthMetric = {
  key: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  evidenceAr: string;
  evidenceEn: string;
  nextStepAr: string;
  nextStepEn: string;
  value: number;
  status: HealthStatus;
};

type HealthSection = {
  key: string;
  titleAr: string;
  titleEn: string;
  icon: typeof ShieldCheck;
  metrics: HealthMetric[];
};

type RoleRow = {
  id: string;
  key: string;
  organization_id: string | null;
};

type AssignmentRow = {
  user_id: string;
  role_id: string;
  organization_id: string | null;
};

type MembershipRow = {
  user_id: string;
  status: "active" | "invited" | "suspended";
};

type RolePermissionRow = {
  role_id: string;
  permission_id: string;
};

type PermissionRow = {
  id: string;
  key: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "صحة الأمن والتشغيل | AqarBooks" : "Security & Ops Health | AqarBooks",
    description: isAr
      ? "لوحة قراءة فقط لمؤشرات عزل الصلاحيات وجاهزية التشغيل داخل المنشأة."
      : "Read-only authorization containment and operational readiness checks for the current organization.",
  };
}

export default async function SecurityHealthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  setRequestLocale(locale as Locale);

  const user = await getCurrentUser();
  if (!user) {
    return redirect({ href: "/login", locale: locale as Locale });
  }

  const organization = await getPrimaryOrganization(user.id);
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "tenant.settings.manage", locale);
  if (denied) return denied;

  const health = await loadSecurityHealth(organization.id);
  const allMetrics = health.sections.flatMap((section) => section.metrics);
  const criticalCount = allMetrics.filter((metric) => metric.status === "critical").length;
  const attentionCount = allMetrics.filter((metric) => metric.status === "attention").length;
  const overallStatus: HealthStatus = criticalCount > 0 ? "critical" : attentionCount > 0 ? "attention" : "healthy";
  const remediationQueue = allMetrics
    .filter((metric) => metric.status === "critical" || metric.status === "attention")
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));
  const snapshotText = buildSnapshotText({
    organizationName: organization.name,
    locale,
    overallStatus,
    criticalCount,
    attentionCount,
    metrics: allMetrics,
    remediationQueue,
  });

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-border bg-card px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">
              <LockKeyhole className="size-3.5" />
              {isAr ? "قراءة فقط" : "Read only"}
            </div>
            <h1 className="text-2xl font-black tracking-normal text-foreground">
              {isAr ? "صحة الأمن والتشغيل" : "Security & Ops Health"}
            </h1>
            <p className="text-sm leading-7 text-muted-foreground">
              {isAr
                ? `مؤشرات مباشرة لمنشأة ${organization.name} تكشف حالة عزل الصلاحيات، نظافة الأدوار، وجاهزية النشر بعد حزمة W0-SEC.`
                : `Live indicators for ${organization.name}, covering authorization containment, role hygiene, and W0-SEC deployment readiness.`}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <StatusBadge status={overallStatus} locale={locale} />
            <SecurityHealthSnapshotActions locale={locale} snapshotText={snapshotText} />
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <PulseCard
          label={isAr ? "مؤشرات مانعة" : "Blocking findings"}
          value={criticalCount}
          status={criticalCount > 0 ? "critical" : "healthy"}
        />
        <PulseCard
          label={isAr ? "تحتاج متابعة" : "Needs follow-up"}
          value={attentionCount}
          status={attentionCount > 0 ? "attention" : "healthy"}
        />
        <PulseCard
          label={isAr ? "فحوصات مكتملة" : "Checks covered"}
          value={health.sections.reduce((sum, section) => sum + section.metrics.length, 0)}
          status="info"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ReadinessDecision status={overallStatus} criticalCount={criticalCount} attentionCount={attentionCount} locale={locale} />
        <RemediationQueue metrics={remediationQueue} locale={locale} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {health.sections.map((section) => (
          <HealthSectionCard key={section.key} section={section} locale={locale} />
        ))}
      </section>
    </div>
  );
}

async function loadSecurityHealth(organizationId: string): Promise<{ sections: HealthSection[] }> {
  const supabase = await createClient();

  const [{ data: rolesData }, { data: membershipsData }, { data: assignmentsData }, { data: templatesData }] = await Promise.all([
    supabase.from("roles").select("id, key, organization_id").or(`organization_id.eq.${organizationId},organization_id.is.null`),
    supabase.from("organization_memberships").select("user_id, status").eq("organization_id", organizationId),
    supabase.from("user_role_assignments").select("user_id, role_id, organization_id").eq("organization_id", organizationId),
    supabase.from("role_templates").select("key"),
  ]);

  const roles = (rolesData ?? []) as RoleRow[];
  const memberships = (membershipsData ?? []) as MembershipRow[];
  const assignments = (assignmentsData ?? []) as AssignmentRow[];
  const templateKeys = new Set((templatesData ?? []).map((template) => template.key));
  const tenantRoleKeys = new Set(roles.filter((role) => role.organization_id === organizationId).map((role) => role.key));
  const missingTemplateRoles = [...templateKeys].filter((key) => !tenantRoleKeys.has(key)).length;

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const roleIds = roles.map((role) => role.id);
  const rolePermissions = await loadRolePermissions(roleIds);
  const permissionsById = await loadPermissions([...new Set(rolePermissions.map((row) => row.permission_id))]);
  const platformPermissionIds = new Set(
    [...permissionsById.values()].filter((permission) => permission.key.startsWith("platform.")).map((permission) => permission.id),
  );

  const activeUsers = new Set(memberships.filter((membership) => membership.status === "active").map((membership) => membership.user_id));
  const tenantRoleIdsWithPlatformPermissions = new Set(
    rolePermissions
      .filter((row) => platformPermissionIds.has(row.permission_id))
      .map((row) => roleById.get(row.role_id))
      .filter((role): role is RoleRow => role !== undefined && role.organization_id === organizationId)
      .map((role) => role.id),
  );

  const activeOwnerUsers = new Set(
    assignments
      .filter((assignment) => assignment.organization_id === organizationId && activeUsers.has(assignment.user_id))
      .filter((assignment) => roleById.get(assignment.role_id)?.key === "TENANT_OWNER")
      .map((assignment) => assignment.user_id),
  );

  const crossTenantAssignments = assignments.filter((assignment) => {
    const role = roleById.get(assignment.role_id);
    return Boolean(role?.organization_id && role.organization_id !== organizationId);
  }).length;

  const platformAdminAssignments = assignments.filter((assignment) => roleById.get(assignment.role_id)?.key === "PLATFORM_SUPER_ADMIN").length;
  const globalSystemRoleAssignments = assignments.filter((assignment) => roleById.get(assignment.role_id)?.organization_id === null).length;
  const orphanedAssignments = assignments.filter((assignment) => !activeUsers.has(assignment.user_id)).length;

  return {
    sections: [
      {
        key: "authorization-containment",
        titleAr: "عزل الصلاحيات",
        titleEn: "Authorization Containment",
        icon: ShieldCheck,
        metrics: [
          metric({
            key: "cross-tenant-assignments",
            labelAr: "تعيينات عابرة لمنشآت أخرى",
            labelEn: "Cross-tenant assignments",
            descriptionAr: "أدوار منشأة أخرى مستخدمة داخل هذه المنشأة.",
            descriptionEn: "Roles owned by another organization but assigned inside this one.",
            evidenceAr: "تمت مقارنة organization_id لكل تعيين مع مالك الدور المرتبط به.",
            evidenceEn: "Compares each assignment organization_id with the owning organization on its role.",
            nextStepAr: crossTenantAssignments === 0 ? "استمر في مراقبة التعيينات الجديدة بعد كل نشر." : "انقل المستخدمين إلى أدوار مستنسخة داخل هذه المنشأة قبل النشر.",
            nextStepEn:
              crossTenantAssignments === 0
                ? "Keep monitoring new assignments after each release."
                : "Move affected users to roles cloned inside this organization before release.",
            value: crossTenantAssignments,
            status: crossTenantAssignments === 0 ? "healthy" : "critical",
          }),
          metric({
            key: "platform-admin-assignments",
            labelAr: "تعيينات Platform Admin داخل المنشأة",
            labelEn: "Platform admin tenant assignments",
            descriptionAr: "أي تعيين Platform Super Admin يجب أن يبقى خارج نطاق tenant.",
            descriptionEn: "Platform Super Admin assignments should stay outside tenant scope.",
            evidenceAr: "تم فحص تعيينات هذه المنشأة لأي دور بمفتاح PLATFORM_SUPER_ADMIN.",
            evidenceEn: "Checks this organization's role assignments for PLATFORM_SUPER_ADMIN.",
            nextStepAr:
              platformAdminAssignments === 0
                ? "لا توجد صلاحيات منصة داخل نطاق المنشأة."
                : "أزل تعيينات Platform Admin من نطاق المنشأة وانقلها لقناة إدارة المنصة.",
            nextStepEn:
              platformAdminAssignments === 0
                ? "No platform authority is present inside tenant scope."
                : "Remove Platform Admin assignments from tenant scope and move them to platform administration.",
            value: platformAdminAssignments,
            status: platformAdminAssignments === 0 ? "healthy" : "critical",
          }),
        ],
      },
      {
        key: "tenant-ownership",
        titleAr: "ملكية المنشأة",
        titleEn: "Tenant Ownership",
        icon: Users,
        metrics: [
          metric({
            key: "active-owner-users",
            labelAr: "ملاك نشطون",
            labelEn: "Active owners",
            descriptionAr: "عدد المستخدمين النشطين بدور TENANT_OWNER.",
            descriptionEn: "Active members holding the TENANT_OWNER role.",
            evidenceAr: "تم عد المستخدمين النشطين الذين لديهم تعيين TENANT_OWNER داخل المنشأة.",
            evidenceEn: "Counts active members assigned TENANT_OWNER inside the organization.",
            nextStepAr:
              activeOwnerUsers.size === 1
                ? "الملكية مضبوطة: مالك نشط واحد للمنشأة."
                : "راجع ملاك المنشأة؛ الأفضل وجود مالك نشط واحد واضح أو سياسة تعدد معتمدة.",
            nextStepEn:
              activeOwnerUsers.size === 1
                ? "Ownership is clean: one active owner."
                : "Review tenant owners; prefer one clear active owner or an approved multiple-owner policy.",
            value: activeOwnerUsers.size,
            status: activeOwnerUsers.size === 1 ? "healthy" : "attention",
          }),
          metric({
            key: "orphaned-assignments",
            labelAr: "تعيينات بلا عضوية نشطة",
            labelEn: "Assignments without active membership",
            descriptionAr: "تعيينات دور لمستخدم غير نشط داخل المنشأة.",
            descriptionEn: "Role assignments belonging to users without active membership.",
            evidenceAr: "تمت مطابقة تعيينات الأدوار مع العضويات النشطة لنفس المستخدم والمنشأة.",
            evidenceEn: "Matches role assignments against active memberships for the same user and organization.",
            nextStepAr:
              orphanedAssignments === 0
                ? "كل التعيينات مرتبطة بعضويات نشطة."
                : "نظف التعيينات المتبقية للمستخدمين غير النشطين أو أعد تفعيل عضوياتهم إن لزم.",
            nextStepEn:
              orphanedAssignments === 0
                ? "Every assignment belongs to an active membership."
                : "Remove stale assignments for inactive users or reactivate membership when appropriate.",
            value: orphanedAssignments,
            status: orphanedAssignments === 0 ? "healthy" : "attention",
          }),
        ],
      },
      {
        key: "role-hygiene",
        titleAr: "نظافة الأدوار",
        titleEn: "Role Hygiene",
        icon: Database,
        metrics: [
          metric({
            key: "tenant-platform-permissions",
            labelAr: "أدوار Tenant تحمل صلاحيات Platform",
            labelEn: "Tenant roles with platform permissions",
            descriptionAr: "صلاحيات platform.* لا يجب أن تظهر داخل أدوار المنشأة.",
            descriptionEn: "platform.* permissions should not be granted to organization roles.",
            evidenceAr: "تم فحص role_permissions لأدوار المنشأة ضد كتالوج صلاحيات platform.*.",
            evidenceEn: "Checks organization role_permissions against the platform.* permission catalog.",
            nextStepAr:
              tenantRoleIdsWithPlatformPermissions.size === 0
                ? "كتالوج صلاحيات المنشأة لا يحتوي صلاحيات منصة."
                : "احذف صلاحيات platform.* من أدوار tenant وراجع مصدر القالب.",
            nextStepEn:
              tenantRoleIdsWithPlatformPermissions.size === 0
                ? "Tenant role permissions are free of platform authority."
                : "Remove platform.* grants from tenant roles and review the template source.",
            value: tenantRoleIdsWithPlatformPermissions.size,
            status: tenantRoleIdsWithPlatformPermissions.size === 0 ? "healthy" : "critical",
          }),
          metric({
            key: "missing-template-roles",
            labelAr: "أدوار قالب غير مستنسخة",
            labelEn: "Missing cloned template roles",
            descriptionAr: "الفارق بين قوالب الأدوار الرسمية وأدوار المنشأة الحالية.",
            descriptionEn: "Gap between official role templates and this organization's role set.",
            evidenceAr: "تمت مقارنة role_templates مع أدوار المنشأة المستنسخة الحالية.",
            evidenceEn: "Compares role_templates with the organization's cloned role set.",
            nextStepAr:
              missingTemplateRoles === 0
                ? "كل أدوار القالب الرسمية موجودة داخل المنشأة."
                : "أعد تشغيل استنساخ قوالب الأدوار لهذه المنشأة بعد مراجعة الفروقات.",
            nextStepEn:
              missingTemplateRoles === 0
                ? "All official template roles exist in this organization."
                : "Re-run tenant role template cloning for this organization after reviewing gaps.",
            value: missingTemplateRoles,
            status: missingTemplateRoles === 0 ? "healthy" : "attention",
          }),
        ],
      },
      {
        key: "deployment-readiness",
        titleAr: "جاهزية النشر",
        titleEn: "Deployment Readiness",
        icon: Activity,
        metrics: [
          metric({
            key: "global-system-role-assignments",
            labelAr: "اعتماد على أدوار نظام عامة",
            labelEn: "Global system role reliance",
            descriptionAr: "تعيينات tenant ما زالت تشير لأدوار عامة بدل النسخ الخاصة بالمنشأة.",
            descriptionEn: "Tenant assignments still pointing at global roles instead of cloned tenant roles.",
            evidenceAr: "تم فحص أي تعيين داخل المنشأة يشير إلى دور organization_id الخاص به فارغ.",
            evidenceEn: "Finds tenant assignments that still point to roles with a null organization_id.",
            nextStepAr:
              globalSystemRoleAssignments === 0
                ? "التعيينات تعتمد على أدوار المنشأة الخاصة بها."
                : "حوّل التعيينات من الأدوار العامة إلى نسخ المنشأة الخاصة.",
            nextStepEn:
              globalSystemRoleAssignments === 0
                ? "Assignments rely on organization-owned roles."
                : "Move assignments from global roles to organization-owned role copies.",
            value: globalSystemRoleAssignments,
            status: globalSystemRoleAssignments === 0 ? "healthy" : "attention",
          }),
          metric({
            key: "blocking-readiness-findings",
            labelAr: "موانع قبل النشر",
            labelEn: "Release blockers",
            descriptionAr: "إجمالي المؤشرات التي تمنع اعتبار عزل الصلاحيات جاهزا.",
            descriptionEn: "Total findings that block authorization containment readiness.",
            evidenceAr: "يجمع التعيينات العابرة، Platform Admin داخل tenant، وصلاحيات platform.* داخل أدوار المنشأة.",
            evidenceEn: "Combines cross-tenant assignments, tenant-scoped Platform Admin, and platform.* grants.",
            nextStepAr:
              crossTenantAssignments + platformAdminAssignments + tenantRoleIdsWithPlatformPermissions.size === 0
                ? "لا توجد موانع أمنية حرجة قبل النشر."
                : "عالِج المؤشرات الحرجة أولا ثم أعد فحص الصفحة.",
            nextStepEn:
              crossTenantAssignments + platformAdminAssignments + tenantRoleIdsWithPlatformPermissions.size === 0
                ? "No critical security blockers before release."
                : "Resolve critical findings first, then reload this dashboard.",
            value: crossTenantAssignments + platformAdminAssignments + tenantRoleIdsWithPlatformPermissions.size,
            status:
              crossTenantAssignments + platformAdminAssignments + tenantRoleIdsWithPlatformPermissions.size === 0
                ? "healthy"
                : "critical",
          }),
        ],
      },
    ],
  };
}

async function loadRolePermissions(roleIds: string[]): Promise<RolePermissionRow[]> {
  if (!roleIds.length) return [];

  const supabase = await createClient();
  const { data } = await supabase.from("role_permissions").select("role_id, permission_id").in("role_id", roleIds);
  return (data ?? []) as RolePermissionRow[];
}

async function loadPermissions(permissionIds: string[]): Promise<Map<string, PermissionRow>> {
  if (!permissionIds.length) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.from("permissions").select("id, key").in("id", permissionIds);
  return new Map(((data ?? []) as PermissionRow[]).map((permission) => [permission.id, permission]));
}

function metric(metric: HealthMetric): HealthMetric {
  return metric;
}

function statusRank(status: HealthStatus): number {
  if (status === "critical") return 0;
  if (status === "attention") return 1;
  if (status === "info") return 2;
  return 3;
}

function buildSnapshotText({
  organizationName,
  locale,
  overallStatus,
  criticalCount,
  attentionCount,
  metrics,
  remediationQueue,
}: {
  organizationName: string;
  locale: string;
  overallStatus: HealthStatus;
  criticalCount: number;
  attentionCount: number;
  metrics: HealthMetric[];
  remediationQueue: HealthMetric[];
}): string {
  const isAr = locale === "ar";
  const statusLabels: Record<HealthStatus, string> = {
    healthy: isAr ? "سليم" : "Healthy",
    attention: isAr ? "يحتاج متابعة" : "Needs follow-up",
    critical: isAr ? "مانع" : "Blocking",
    info: isAr ? "معلومات" : "Info",
  };
  const lines = [
    isAr ? "AqarBooks - Snapshot صحة الأمن والتشغيل" : "AqarBooks - Security & Ops Health Snapshot",
    `${isAr ? "المنشأة" : "Organization"}: ${organizationName}`,
    `${isAr ? "قرار الجاهزية" : "Readiness decision"}: ${statusLabels[overallStatus]}`,
    `${isAr ? "مؤشرات مانعة" : "Blocking findings"}: ${criticalCount}`,
    `${isAr ? "تحتاج متابعة" : "Needs follow-up"}: ${attentionCount}`,
    "",
    isAr ? "المؤشرات:" : "Metrics:",
    ...metrics.map((metric) => {
      const label = isAr ? metric.labelAr : metric.labelEn;
      const nextStep = isAr ? metric.nextStepAr : metric.nextStepEn;
      return `- ${label}: ${metric.value} (${statusLabels[metric.status]}) | ${isAr ? "الخطوة التالية" : "Next step"}: ${nextStep}`;
    }),
    "",
    isAr ? "أولويات المعالجة:" : "Remediation priorities:",
    ...(remediationQueue.length
      ? remediationQueue.map((metric, index) => `${index + 1}. ${isAr ? metric.labelAr : metric.labelEn}`)
      : [isAr ? "لا توجد أولويات مفتوحة." : "No open priorities."]),
  ];

  return lines.join("\n");
}

function ReadinessDecision({
  status,
  criticalCount,
  attentionCount,
  locale,
}: {
  status: HealthStatus;
  criticalCount: number;
  attentionCount: number;
  locale: string;
}) {
  const isAr = locale === "ar";
  const ready = status === "healthy";
  const title = isAr ? "قرار الجاهزية" : "Readiness Decision";
  const decision = ready
    ? isAr
      ? "جاهز للنشر"
      : "Ready to release"
    : criticalCount > 0
      ? isAr
        ? "غير جاهز للنشر"
        : "Not ready to release"
      : isAr
        ? "جاهز مع متابعة"
        : "Ready with follow-up";
  const body = ready
    ? isAr
      ? "لا توجد موانع أو تنبيهات تشغيلية على مؤشرات العزل الحالية."
      : "No blockers or operational warnings appear in the current containment checks."
    : criticalCount > 0
      ? isAr
        ? `يوجد ${criticalCount} مؤشر مانع يجب إغلاقه قبل اعتبار الحزمة جاهزة.`
        : `${criticalCount} blocking indicator must be closed before this package is considered ready.`
      : isAr
        ? `لا توجد موانع، لكن يوجد ${attentionCount} بند متابعة يستحق المراجعة.`
        : `No blockers, but ${attentionCount} follow-up item should be reviewed.`;

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-base font-black text-foreground">{title}</h2>
          <p className="text-xl font-black text-foreground">{decision}</p>
          <p className="text-xs leading-6 text-muted-foreground">{body}</p>
        </div>
        <StatusBadge status={status} locale={locale} />
      </div>
    </article>
  );
}

function RemediationQueue({ metrics, locale }: { metrics: HealthMetric[]; locale: string }) {
  const isAr = locale === "ar";

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-foreground">{isAr ? "أولويات المعالجة" : "Remediation Priorities"}</h2>
        <span className="font-mono text-xs font-bold text-muted-foreground">{metrics.length}</span>
      </div>

      {metrics.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {isAr
            ? "لا توجد أولويات مفتوحة الآن. أعد الفحص بعد أي تغيير في الأدوار أو العضويات."
            : "No open priorities. Re-check after any role or membership change."}
        </p>
      ) : (
        <ol className="space-y-2">
          {metrics.map((metric, index) => (
            <li key={metric.key} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-black text-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground">{isAr ? metric.labelAr : metric.labelEn}</h3>
                    <StatusBadge status={metric.status} locale={locale} compact />
                  </div>
                  <p className="text-xs leading-6 text-muted-foreground">
                    <span className="font-bold text-foreground">{isAr ? "الخطوة التالية" : "Next step"}: </span>
                    {isAr ? metric.nextStepAr : metric.nextStepEn}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function HealthSectionCard({ section, locale }: { section: HealthSection; locale: string }) {
  const isAr = locale === "ar";
  const Icon = section.icon;

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
          <Icon className="size-5" />
        </div>
        <h2 className="text-base font-black text-foreground">{isAr ? section.titleAr : section.titleEn}</h2>
      </div>

      <div className="space-y-3">
        {section.metrics.map((metric) => (
          <div key={metric.key} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-bold text-foreground">{isAr ? metric.labelAr : metric.labelEn}</h3>
                <p className="text-xs leading-6 text-muted-foreground">{isAr ? metric.descriptionAr : metric.descriptionEn}</p>
                <div className="grid gap-2 pt-1 text-xs leading-6 text-muted-foreground sm:grid-cols-2">
                  <p className="rounded-md bg-muted px-2.5 py-2">
                    <span className="font-bold text-foreground">{isAr ? "ما الذي فُحص؟" : "Evidence"} </span>
                    {isAr ? metric.evidenceAr : metric.evidenceEn}
                  </p>
                  <p className="rounded-md bg-muted px-2.5 py-2">
                    <span className="inline-flex items-center gap-1 font-bold text-foreground">
                      {isAr ? "الخطوة التالية" : "Next step"}
                      <ArrowRight className={cn("size-3", isAr && "rotate-180")} />
                    </span>{" "}
                    {isAr ? metric.nextStepAr : metric.nextStepEn}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-end">
                <div className="font-mono text-2xl font-black text-foreground">{metric.value}</div>
                <StatusBadge status={metric.status} locale={locale} compact />
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function PulseCard({ label, value, status }: { label: string; value: number; status: HealthStatus }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <StatusIcon status={status} />
      </div>
      <div className="mt-3 font-mono text-3xl font-black text-foreground">{value}</div>
    </div>
  );
}

function StatusBadge({ status, locale, compact = false }: { status: HealthStatus; locale: string; compact?: boolean }) {
  const isAr = locale === "ar";
  const labels: Record<HealthStatus, string> = {
    healthy: isAr ? "سليم" : "Healthy",
    attention: isAr ? "يحتاج متابعة" : "Needs follow-up",
    critical: isAr ? "مانع" : "Blocking",
    info: isAr ? "معلومات" : "Info",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold",
        compact && "px-2 py-0.5 text-[10px]",
        status === "healthy" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
        status === "attention" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
        status === "critical" && "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
        status === "info" && "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
      )}
    >
      <StatusIcon status={status} />
      {labels[status]}
    </span>
  );
}

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "healthy") return <CheckCircle2 className="size-3.5" />;
  if (status === "critical") return <AlertTriangle className="size-3.5" />;
  return <Info className="size-3.5" />;
}
