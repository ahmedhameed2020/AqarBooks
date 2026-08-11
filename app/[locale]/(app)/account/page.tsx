import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { ProfileForm, PasswordForm } from "./account-forms";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale: locale as Locale });
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, locale")
    .eq("id", user!.id)
    .single();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "حسابي" : "My Account"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "إعدادات شخصية للمستخدم — منفصلة عن إعدادات المنظمة." : "Personal account settings — separate from organization settings."}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{isAr ? "الملف الشخصي" : "Profile"}</h2>
        <ProfileForm
          email={user!.email ?? ""}
          fullName={profile?.full_name ?? ""}
          locale={profile?.locale ?? locale}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{isAr ? "كلمة المرور" : "Password"}</h2>
        <PasswordForm locale={locale} />
      </section>
    </div>
  );
}
