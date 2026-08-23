import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { listOwnDocumentsAction } from "@/lib/actions/member-portal-documents";
import type { Locale } from "@/i18n/routing";
import { PortalDocumentsClient } from "./portal-documents-client";

export default async function PortalDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const result = await listOwnDocumentsAction();

  return (
    <PortalDocumentsClient
      documents={result.ok ? result.documents : []}
      loadFailed={!result.ok}
      locale={locale}
    />
  );
}
