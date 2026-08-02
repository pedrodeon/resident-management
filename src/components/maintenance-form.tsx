"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PillToggle } from "@/components/ui/pill-toggle";
import {
  submitMaintenance,
  type Urgency,
} from "@/app/(app)/maintenance/actions";

function todayISO() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function MaintenanceForm() {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [error, setError] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitMaintenance({
        location,
        date,
        description,
        urgency,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.emailWarning) {
        // Saved but not emailed — say exactly that, then go to the list where
        // the request is now visible.
        setEmailWarning(result.emailWarning);
      } else {
        router.push("/maintenance");
      }
    });
  }

  if (emailWarning) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="attention">
          The request was <strong>saved to the maintenance list</strong>, but
          the email could not be sent: {emailWarning}
        </Alert>
        <div>
          <Button variant="subtle" onClick={() => router.push("/maintenance")}>
            View the list
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}

      <Card variant="box">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Where is the problem?</span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Room 213, Lebanon 2 bathroom, front stairwell"
              className="rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Date noticed</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium">What&rsquo;s broken?</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="rounded-xl border border-line px-3 py-2 text-base"
          />
        </label>

        <div className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium">Urgency</span>
          <PillToggle
            options={[
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
            ]}
            value={urgency}
            onChange={setUrgency}
          />
        </div>
      </Card>

      <Alert tone="info" icon>
        Submitting emails the Resident Director with a copy to you, and adds
        the request to the open list so anyone can mark it done once fixed.
      </Alert>

      <div className="flex gap-2">
        <Button
          size="lg"
          onClick={submit}
          disabled={isPending || !location.trim() || !description.trim()}
        >
          {isPending ? "Sending…" : "Send request"}
        </Button>
        <Button
          variant="subtle"
          size="lg"
          onClick={() => router.push("/maintenance")}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
