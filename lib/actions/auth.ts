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

  let error;
  try {
    ({ error } = await supabase.auth.signInWithPassword(parsed.data));
  } catch (thrown) {
    // A transport-level failure never means the password was wrong.
    console.error("[signIn] auth request threw", thrown);
    return { error: "generic" };
  }

  if (error) {
    // Only a genuine credential rejection should be reported as one --
    // anything else (misconfigured keys, network, rate limiting, an outage)
    // used to surface as "wrong email or password", which sends people off
    // resetting a password that was fine.
    const isCredentialError =
      error.code === "invalid_credentials" || error.code === "email_not_confirmed";

    if (!isCredentialError) {
      console.error("[signIn] non-credential auth failure", {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }

    return { error: isCredentialError ? "invalid_credentials" : "generic" };
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

export async function requestPasswordResetAction(
  email: string,
  redirectToUrl?: string
): Promise<{
  ok: boolean;
  error?: string;
  code?: string;
}> {
  const parsed = z.string().email("البريد الإلكتروني غير صالح").safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "البريد الإلكتروني غير صالح" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: redirectToUrl,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    // 530 error indicates SMTP server rejection / built-in rate limit or SMTP misconfiguration
    if (msg.includes("530") || msg.includes("smtp") || (error as { status?: number }).status === 530) {
      return {
        ok: false,
        error: "تعذر إرسال البريد مؤقتاً عبر خادم SMTP (تم تجاوز حد الإرسال المسموح أو إعدادات مزود البريد في Supabase بحاجة لضبط).",
        code: "SMTP_ERROR",
      };
    }
    if (msg.includes("rate limit") || msg.includes("too many") || (error as { status?: number }).status === 429) {
      return {
        ok: false,
        error: "تم إرسال عدة طلبات خلال وقت قصير. يرجى الانتظار بضع دقائق ثم المحاولة مجدداً.",
        code: "RATE_LIMIT",
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function updatePasswordAction(
  password: string,
  confirmPassword: string
): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (password !== confirmPassword) {
    return { ok: false, error: "كلمتا المرور غير متطابقتين" };
  }

  const parsed = z.string().min(8, "كلمة المرور يجب ألا تقل عن 8 خانات").safeParse(password);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

