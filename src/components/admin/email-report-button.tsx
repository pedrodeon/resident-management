"use client";

import { useState, useTransition } from "react";
import { emailRaReport } from "@/app/(app)/admin/reports/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** "Email this report to me" — sends the shown week to RD_EMAIL, right now. */
export function EmailReportButton({ weekStart }: { weekStart: string }) {
  const [result, setResult] = useState<
    { tone: "info" | "error"; text: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  function send() {
    setResult(null);
    startTransition(async () => {
      const r = await emailRaReport(weekStart);
      setResult(
        r.ok
          ? { tone: "info", text: "Report sent to the RD address." }
          : { tone: "error", text: r.error },
      );
    });
  }

  return (
    <div>
      <Button size="md" onClick={send} disabled={isPending}>
        {isPending ? "Sending…" : "Email this report to me"}
      </Button>
      {result && (
        <Alert tone={result.tone} className="mt-3">
          {result.text}
        </Alert>
      )}
    </div>
  );
}
