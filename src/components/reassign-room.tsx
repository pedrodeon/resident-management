"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reassignRoom } from "@/app/(app)/residents/[id]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type RoomOption = {
  id: string;
  label: string; // "Holiday 1 · Room 101"
};

export function ReassignRoom({
  occupancyId,
  currentRoomId,
  rooms,
}: {
  /** The stay being moved: the stay continues, only its room changes. */
  occupancyId: string;
  currentRoomId: string;
  rooms: RoomOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toRoom, setToRoom] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await reassignRoom(occupancyId, toRoom, reason);
      if (!result.ok) {
        setError(result.error);
      } else {
        setOpen(false);
        setToRoom("");
        setReason("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reassign room
      </Button>
    );
  }

  return (
    <Card variant="box">
      <h3 className="text-sm font-semibold">Reassign room</h3>
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">New room</span>
          <select
            value={toRoom}
            onChange={(e) => setToRoom(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          >
            <option value="">Select a room…</option>
            {rooms
              .filter((r) => r.id !== currentRoomId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Reason <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
        <div className="flex gap-2">
          <Button onClick={submit} disabled={isPending || !toRoom}>
            {isPending ? "Moving…" : "Move resident"}
          </Button>
          <Button
            variant="subtle"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
