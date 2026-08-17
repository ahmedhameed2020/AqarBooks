import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AcceptInviteClient } from "./accept-invite-client";

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ invitation?: string; t?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { invitation, t } = await searchParams;

  return <AcceptInviteClient locale={locale as Locale} invitationId={invitation ?? null} token={t ?? null} />;
}
