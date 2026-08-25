"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  locale: z.enum(["ar", "en"]),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export async function updateProfileAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    locale: formData.get("locale"),
    phone: formData.get("phone") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    avatarUrl: formData.get("avatarUrl") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      locale: parsed.data.locale,
      ...(parsed.data.avatarUrl ? { avatar_url: parsed.data.avatarUrl } : {}),
    })
    .eq("id", user.id);

  if (profileError) return { ok: false, error: profileError.message };

  // Also store extended metadata on auth user
  await supabase.auth.updateUser({
    data: {
      phone: parsed.data.phone || null,
      job_title: parsed.data.jobTitle || null,
      avatar_url: parsed.data.avatarUrl || null,
    },
  });

  revalidatePath("/[locale]/account", "page");
  return { ok: true };
}

const changePasswordSchema = z
  .object({
    password: z.string().min(8).max(72),
    confirmPassword: z.string().min(8).max(72),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwords_do_not_match",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.path.includes("confirmPassword"));
    return { ok: false, error: mismatch ? "passwords_do_not_match" : "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updatePreferencesAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const defaultLandingPage = formData.get("defaultLandingPage")?.toString() || "/dashboard";
  const waNotifications = formData.get("waNotifications") === "true";
  const emailDigest = formData.get("emailDigest") === "true";
  const securityAlerts = formData.get("securityAlerts") === "true";

  const { error } = await supabase.auth.updateUser({
    data: {
      default_landing_page: defaultLandingPage,
      wa_notifications: waNotifications,
      email_digest: emailDigest,
      security_alerts: securityAlerts,
    },
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/account", "page");
  return { ok: true };
}

export async function signOutOtherSessionsAction(): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

