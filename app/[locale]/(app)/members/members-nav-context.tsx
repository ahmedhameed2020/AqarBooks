"use client";

import { createContext, useContext, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";

type MembersNavContextValue = {
  isPending: boolean;
  get: (key: string) => string | undefined;
  pushParams: (next: Record<string, string | undefined>) => void;
};

const MembersNavContext = createContext<MembersNavContextValue | null>(null);

// One shared useTransition for every interactive control on /members
// (search, filter chips, sort headers, pagination) so a single isPending
// flag can drive the table's skeleton overlay regardless of which control
// triggered the navigation. All URL state (filters, sort, pagination,
// drawer) is read/written here -- nothing is kept in component state.
export function MembersNavProvider({ children }: { children: React.ReactNode }) {
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
      router.push(`/members${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <MembersNavContext.Provider
      value={{ isPending, get: (key) => searchParams.get(key) ?? undefined, pushParams }}
    >
      {children}
    </MembersNavContext.Provider>
  );
}

export function useMembersNav() {
  const ctx = useContext(MembersNavContext);
  if (!ctx) throw new Error("useMembersNav must be used within MembersNavProvider");
  return ctx;
}
