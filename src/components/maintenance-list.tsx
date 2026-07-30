"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PillToggle } from "@/components/ui/pill-toggle";
import { setMaintenanceStatus } from "@/app/(app)/maintenance/actions";

export type MaintenanceItem = {
  id: string;
  location: string;
  description: string;
  urgency: "low" | "normal" | "high";
  status: "open" | "done";
  created_at: string;
  filedBy: string | null;
  doneBy: string | null;
  done_at: string | null;
};

export function MaintenanceList({ items }: { items: MaintenanceItem[] }) {
  const [view, setView] = useState<"open" | "done">("open");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = items.filter((i) => i.status === "open");
  const done = items.filter((i) => i.status === "done");
  const visible = view === "open" ? open : done;

  function setStatus(id: string, status: "open" | "done") {
    setError(null);
    startTransition(async () => {
      const result = await setMaintenanceStatus(id, status);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <PillToggle
          options={[
            { value: "open", label: `Open ${open.length}` },
            { value: "done", label: `Done ${done.length}` },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {view === "open"
            ? "Nothing outstanding — the building is in one piece."
            : "Nothing marked done yet."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {visible.map((item) => (
            <li
              key={item.id}
              className={`rounded-[18px] border bg-white px-4 py-3 shadow-[0_2px_6px_rgba(15,29,58,0.05)] ${
                item.status === "open" && item.urgency === "high"
                  ? "border-accent-border"
                  : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {item.location}
                </p>
                {item.urgency === "high" ? (
                  <Badge tone="attention">High</Badge>
                ) : item.urgency === "low" ? (
                  <Badge tone="quiet">Low</Badge>
                ) : (
                  <Badge tone="neutral">Normal</Badge>
                )}
                {item.status === "open" ? (
                  <Button
                    size="sm"
                    onClick={() => setStatus(item.id, "done")}
                    disabled={isPending}
                  >
                    Mark done
                  </Button>
                ) : (
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => setStatus(item.id, "open")}
                    disabled={isPending}
                  >
                    Reopen
                  </Button>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">
                {item.description}
              </p>
              <p className="mt-1.5 text-xs text-muted">
                Filed {new Date(item.created_at).toLocaleDateString()}
                {item.filedBy ? ` by ${item.filedBy}` : ""}
                {item.status === "done" && item.done_at
                  ? ` · done ${new Date(item.done_at).toLocaleDateString()}${item.doneBy ? ` by ${item.doneBy}` : ""}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
