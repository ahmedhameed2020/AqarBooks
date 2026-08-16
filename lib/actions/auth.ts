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

const signUpSchema = z.object({
  fullName: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب ألا تقل عن 8 خانات"),
  confirmPassword: z.string().min(8),
  acceptTerms: z.string().optional(),
});

export async function signUpAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  requiresVerification?: boolean;
}> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "بيانات التسجيل غير صالحة" };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ok: false, error: "كلمتا المرور غير متطابقتين" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
      },
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const requiresVerification = !data.session && !!data.user;
  return { ok: true, requiresVerification };
}

export async function signOut(locale: Locale) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/login", locale });
}
