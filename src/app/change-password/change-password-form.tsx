"use client";

import { useState, useTransition } from "react";
import { changePassword } from "./actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // On success the action redirects; only errors return.
      const result = await changePassword(password, confirm);
      if (result && !result.ok) setError(result.error);
    });
  }

  const field =
    "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-faint focus:border-navy focus:ring-2 focus:ring-navy/25";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}

      <label className="text-sm font-medium text-ink">
        New password
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1 ${field}`}
        />
      </label>
      <label className="text-sm font-medium text-ink">
        Repeat it
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`mt-1 ${field}`}
        />
      </label>
      <p className="text-xs text-muted">At least 10 characters.</p>

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Saving…" : "Set my password"}
      </Button>
    </form>
  );
}
