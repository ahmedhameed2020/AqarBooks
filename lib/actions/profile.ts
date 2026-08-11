"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  locale: z.enum(["ar", "en"]),
});

export async function updateProfileAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, locale: parsed.data.locale })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

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
