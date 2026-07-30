"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRoomCheck } from "@/app/(app)/rooms/[id]/checks/new/actions";
import type { Rating } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/typography";

const RATING_FIELDS = [
  { key: "floor_cleanliness", label: "Floor cleanliness" },
  { key: "trash", label: "Trash" },
  { key: "laundry", label: "Laundry" },
  { key: "overall", label: "Overall" },
] as const;

type RatingKey = (typeof RATING_FIELDS)[number]["key"];

export function RoomCheckForm({
  roomId,
  roomNumber,
}: {
  roomId: string;
  roomNumber: string;
}) {
  const router = useRouter();
  // No defaults on purpose: every rating must be an explicit choice, so nobody
  // submits accidental 5s (or 1s) for a room they never looked at.
  const [ratings, setRatings] = useState<Partial<Record<RatingKey, Rating>>>({});
  const [notes, setNotes] = useState("");
  const [prohibitedItems, setProhibitedItems] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const complete = RATING_FIELDS.every((f) => ratings[f.key] !== undefined);

  function submit() {
    if (!complete) return;
    setError(null);
    startTransition(async () => {
      const result = await createRoomCheck({
        roomId,
        floor_cleanliness: ratings.floor_cleanliness!,
        trash: ratings.trash!,
        laundry: ratings.laundry!,
        overall: ratings.overall!,
        notes,
        prohibited_items: prohibitedItems,
      });
      // Only returns on error; success redirects server-side.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert tone="error">{error}</Alert>}

      <div>
        <SectionLabel>
          Ratings — Room {roomNumber}
          <span className="ml-2 font-normal normal-case tracking-normal text-gray-400">
            1 = poor · 5 = excellent
          </span>
        </SectionLabel>
        <Card as="ul" variant="list" className="mt-2">
          {RATING_FIELDS.map((field) => (
            <li
              key={field.key}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span className="text-sm font-medium">{field.label}</span>
              <div
                role="radiogroup"
                aria-label={`${field.label} rating`}
                className="flex gap-1.5"
              >
                {([1, 2, 3, 4, 5] as Rating[]).map((value) => {
                  const selected = ratings[field.key] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() =>
                        setRatings((prev) => ({ ...prev, [field.key]: value }))
                      }
                      className={`h-9 w-9 rounded-md border text-sm font-semibold transition-colors ${
                        selected
                          ? "border-navy bg-navy text-white"
                          : "border-gray-300 text-gray-600 hover:border-navy hover:text-navy"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </Card>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Notes <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="rounded-md border border-gray-300 px-3 py-2 text-base"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Prohibited items{" "}
          <span className="font-normal text-gray-400">
            (leave empty if none found)
          </span>
        </span>
        <textarea
          value={prohibitedItems}
          onChange={(e) => setProhibitedItems(e.target.value)}
          rows={2}
          className="rounded-md border border-gray-300 px-3 py-2 text-base"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button size="lg" onClick={submit} disabled={isPending || !complete}>
          {isPending ? "Saving…" : "Save room check"}
        </Button>
        <Button
          variant="subtle"
          size="lg"
          onClick={() => router.push(`/rooms/${roomId}`)}
          disabled={isPending}
        >
          Cancel
        </Button>
        {!complete && (
          <span className="text-xs text-gray-400">
            Pick all four ratings to save.
          </span>
        )}
      </div>
    </div>
  );
}
