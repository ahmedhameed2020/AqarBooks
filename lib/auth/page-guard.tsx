import "server-only";
import { AlertCircle } from "lucide-react";
import { hasPermission } from "@/lib/auth/authorize";

// Page-level authorization, shared so twenty-odd screens do not each invent
// their own.
//
// WHY A PANEL AND NOT A REDIRECT
// A redirect tells someone nothing: they click a link, land back on the
// dashboard, and cannot tell whether the page is broken, gone, or simply not
// theirs. It also makes a mis-assigned key invisible -- the symptom looks like
// a routing bug and gets debugged as one. A named panel says which permission
// is missing, so the person can ask for that exact thing and an administrator
// can grant it without guessing. It follows the precedent already set by the
// AR aging report.
//
// WHY THIS IS NOT THE ONLY GATE
// Data is protected by RLS regardless. This stops the SCREEN from rendering
// for someone whose role does not cover it -- previously these pages rendered
// for anyone who typed the URL, showing structure, totals and controls even
// where the rows themselves came back filtered.

export async function denyIfMissingPermission(
  organizationId: string,
  permissionKey: string,
  locale: string,
): Promise<React.ReactElement | null> {
  const allowed = await hasPermission(organizationId, permissionKey);
  if (allowed) return null;

  const isAr = locale === "ar";

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/50">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-base font-bold text-foreground">
          {isAr ? "لا تملك صلاحية فتح هذه الصفحة" : "You don't have access to this page"}
        </h1>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isAr
            ? "هذه الشاشة متاحة لأصحاب الصلاحية التالية فقط. اطلب من مدير الحساب إضافتها لدورك إن كنت تحتاجها."
            : "This screen is limited to holders of the permission below. Ask an account administrator to add it to your role if you need it."}
        </p>
        {/* Naming the key is deliberate: it is not a secret, and it turns
            "I can't get in" into a request an administrator can act on. */}
        <p className="inline-block rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
          {permissionKey}
        </p>
      </div>
    </main>
  );
}
