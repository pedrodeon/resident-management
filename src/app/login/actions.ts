"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string } | null;

/**
 * Staff email/password sign-in via Supabase Auth. Errors come back through
 * form state (useActionState) — never through the URL, so nothing sensitive
 * ever lands in a query string.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic on purpose — don't reveal whether the email has an account.
    return { error: "Invalid email or password." };
  }

  redirect("/");
}
