"use client";

import { createContext, useContext, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";

type PropertyNavContextValue = {
  isPending: boolean;
  get: (key: string) => string | undefined;
  pushParams: (next: Record<string, string | undefined>) => void;
};

const PropertyNavContext = createContext<PropertyNavContextValue | null>(null);

// Mirrors members-nav-context.tsx: one shared useTransition for every
// interactive control on /property (search, filter chips, resort switch,
// pagination, drawer) so a single isPending flag drives the table's
// skeleton overlay, and all state lives in the URL.
export function PropertyNavProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function pushParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(`/property${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <PropertyNavContext.Provider
      value={{ isPending, get: (key) => searchParams.get(key) ?? undefined, pushParams }}
    >
      {children}
    </PropertyNavContext.Provider>
  );
}

export function usePropertyNav() {
  const ctx = useContext(PropertyNavContext);
  if (!ctx) throw new Error("usePropertyNav must be used within PropertyNavProvider");
  return ctx;
}
