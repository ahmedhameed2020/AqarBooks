import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalProfileClient, type PortalProfileData } from "./portal-profile-client";

type MemberRow = {
  full_name: string;
  legal_name: string | null;
  is_company: boolean;
  customer_type: string | null;
  email: string | null;
  phone: string | null;
  country_code: string | null;
  billing_address: string | null;
  tax_registration_number: string | null;
  identity_document_type: string | null;
  identity_document_number: string | null;
  identity_verified_at: string | null;
  created_at: string;
};

export default async function PortalProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;

  const [
    { data: memberRow, error: memberError },
    { data: orgDisplay },
    { data: summary },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("members")
      .select(
        "full_name, legal_name, is_company, customer_type, email, phone, country_code, billing_address, tax_registration_number, identity_document_type, identity_document_number, identity_verified_at, created_at",
      )
      .eq("id", member.id)
      .maybeSingle(),
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("members_with_financials")
      .select("units_count, total_balance, last_payment_amount, last_payment_date")
      .eq("id", member.id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (memberError) console.error("[PortalProfilePage] member query failed:", memberError.message);

  const row = memberRow as MemberRow | null;

  const profile: PortalProfileData = {
    fullName: row?.full_name ?? member.full_name,
    legalName: row?.legal_name ?? null,
    isCompany: row?.is_company ?? false,
    customerType: row?.customer_type ?? null,
    // The account is reached with the auth email; members.email is the contact
    // of record and can legitimately differ, so both are shown rather than one
    // silently standing in for the other.
    contactEmail: row?.email ?? null,
    signInEmail: user?.email ?? null,
    phone: row?.phone ?? null,
    countryCode: row?.country_code ?? null,
    billingAddress: row?.billing_address ?? null,
    taxRegistrationNumber: row?.tax_registration_number ?? null,
    identityDocumentType: row?.identity_document_type ?? null,
    identityDocumentNumber: row?.identity_document_number ?? null,
    identityVerifiedAt: row?.identity_verified_at ?? null,
    memberSince: row?.created_at?.slice(0, 10) ?? null,
    organizationName: orgDisplay?.name ?? "AqarBooks",
    currency: orgDisplay?.default_currency ?? "EGP",
    unitsCount: Number(summary?.units_count ?? 0),
    totalBalance: Number(summary?.total_balance ?? 0),
    lastPaymentAmount:
      summary?.last_payment_amount === null || summary?.last_payment_amount === undefined
        ? null
        : Number(summary.last_payment_amount),
    lastPaymentDate: summary?.last_payment_date ?? null,
  };

  return <PortalProfileClient profile={profile} locale={locale} />;
}
