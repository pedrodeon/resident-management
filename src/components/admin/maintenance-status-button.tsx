"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMaintenanceStatus } from "@/app/(app)/maintenance/actions";
import { Button } from "@/components/ui/button";

/** Close or reopen one request. RD only — the action and RLS both check. */
export function MaintenanceStatusButton({
  id,
  status,
}: {
  id: string;
  status: "open" | "done";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setMaintenanceStatus(
        id,
        status === "open" ? "done" : "open",
      );
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-700">{error}</span>}
      <Button
        variant={status === "open" ? "primary" : "subtle"}
        size="sm"
        onClick={toggle}
        disabled={isPending}
      >
        {isPending ? "…" : status === "open" ? "Mark done" : "Reopen"}
      </Button>
    </span>
  );
}
