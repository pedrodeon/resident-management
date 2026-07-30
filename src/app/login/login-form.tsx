"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/30"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/30"
        />
      </label>

      {state?.error && <Alert tone="attention">{state.error}</Alert>}

      <Button type="submit" size="lg" className="mt-1" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
