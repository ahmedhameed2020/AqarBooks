"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthRecoveryListener({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 1. Check window.location.hash on mount for type=recovery
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get("type");
      if (type === "recovery" && !pathname.includes("/auth/reset-password")) {
        router.push(`/${locale}/auth/reset-password${window.location.hash}`);
        return;
      }
    }

    // 2. Listen to Supabase auth state changes for PASSWORD_RECOVERY event
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !pathname.includes("/auth/reset-password")) {
        router.push(`/${locale}/auth/reset-password`);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, pathname, locale]);

  return null;
}
