import { LayoutDashboard, FileText, Receipt, Landmark, Building2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export function PortalShell({
  locale,
  memberName,
  children,
}: {
  locale: "ar" | "en";
  memberName: string;
  children: React.ReactNode;
}) {
  const isAr = locale === "ar";
  const boundSignOut = signOut.bind(null, locale);
  const ic = "size-4";

  const links = [
    { href: "/portal", labelAr: "الرئيسية", labelEn: "Dashboard", icon: <LayoutDashboard className={ic} /> },
    { href: "/portal/statement", labelAr: "كشف الحساب", labelEn: "Statement", icon: <FileText className={ic} /> },
    { href: "/portal/dues", labelAr: "المستحقات", labelEn: "Dues", icon: <Landmark className={ic} /> },
    { href: "/portal/payments", labelAr: "المدفوعات", labelEn: "Payments", icon: <Receipt className={ic} /> },
    { href: "/portal/units", labelAr: "وحداتي", labelEn: "My Units", icon: <Building2 className={ic} /> },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="w-64 shrink-0 border-e border-border bg-muted/20 p-4 flex flex-col gap-6">
        <div>
          <p className="text-xs text-muted-foreground">{isAr ? "بوابة الملاك" : "Owner Portal"}</p>
          <p className="font-bold text-foreground truncate">{memberName}</p>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} locale={locale} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted">
              {l.icon}
              {isAr ? l.labelAr : l.labelEn}
            </Link>
          ))}
        </nav>
        <form action={boundSignOut} className="mt-auto">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            {isAr ? "تسجيل الخروج" : "Sign out"}
          </Button>
        </form>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
