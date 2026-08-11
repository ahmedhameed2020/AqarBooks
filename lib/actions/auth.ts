"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { stripLocalePrefix } from "@/lib/i18n/strip-locale-prefix";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignInState = {
  error: "invalid_credentials" | "generic" | null;
};

export async function signIn(
  locale: Locale,
  redirectTo: string | undefined,
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "invalid_credentials" };
  }

  const target = redirectTo ? stripLocalePrefix(redirectTo) : "/dashboard";
  return redirect({ href: target, locale });
}

export async function signOut(locale: Locale) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/login", locale });
}
