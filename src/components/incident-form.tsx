"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { SectionLabel } from "@/components/ui/typography";
import { submitIncident } from "@/app/(app)/reports/incident/actions";

export type IncidentResident = {
  /** Occupancy id — what the report is tied to. */
  id: string;
  full_name: string;
  student_id: string;
  room_id: string;
  room_label: string; // "Holiday 1 · Room 101"
};

export type RoomOption = { id: string; label: string };

/** Local date/time for the field defaults — the incident is usually "now". */
function nowDefaults() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

export function IncidentForm({
  residents,
  rooms,
  recipientsHint,
}: {
  residents: IncidentResident[];
  rooms: RoomOption[];
  /** e.g. "campus security and Residence Life" — from the page, not the env. */
  recipientsHint: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [resident, setResident] = useState<IncidentResident | null>(null);
  const [roomId, setRoomId] = useState("");
  const defaults = nowDefaults();
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [description, setDescription] = useState("");
  const [peopleInvolved, setPeopleInvolved] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const matches = q
    ? residents.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          r.student_id.toLowerCase().includes(q),
      )
    : residents;

  function pick(r: IncidentResident) {
    setResident(r);
    // Default the room to the resident's own; still changeable or clearable.
    setRoomId(r.room_id);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      if (!resident) {
        setError("Pick the resident this report is about.");
        return;
      }
      const result = await submitIncident({
        occupancyId: resident.id,
        roomId: roomId || null,
        date,
        time,
        description,
        peopleInvolved,
        actionsTaken,
      });
      if (!result.ok) setError(result.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="info" icon>
          Report sent to {recipientsHint}, with a copy to you. Nothing was
          stored in the app — the email is the record.
        </Alert>
        <div>
          <Button variant="subtle" onClick={() => router.push("/")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}

      {/* Step 1: who it's about — required, picked from the live roster. */}
      <div>
        <SectionLabel>Resident involved</SectionLabel>
        {resident ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[18px] border border-line bg-white px-3 py-[11px] shadow-[0_2px_6px_rgba(15,29,58,0.05)]">
            <Avatar name={resident.full_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {resident.full_name}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {resident.room_label} ·{" "}
                <span className="font-mono">{resident.student_id}</span>
              </p>
            </div>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setResident(null)}
              disabled={isPending}
            >
              Change
            </Button>
          </div>
        ) : (
          <>
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or student ID"
              autoComplete="off"
              className="mt-3"
            />
            {matches.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No match for &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <ul className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
                {matches.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      className="flex w-full items-center gap-3 rounded-[18px] border border-line bg-white px-3 py-[11px] text-left shadow-[0_2px_6px_rgba(15,29,58,0.05)] transition-all hover:border-navy/40"
                    >
                      <Avatar name={r.full_name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {r.full_name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {r.room_label} ·{" "}
                          <span className="font-mono">{r.student_id}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Step 2: the report. */}
      <Card variant="box">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              Room{" "}
              <span className="font-normal text-faint">(if applicable)</span>
            </span>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="rounded-xl border border-line px-3 py-2 text-base"
            >
              <option value="">Not room-specific</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium">What happened</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="rounded-xl border border-line px-3 py-2 text-base"
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium">
            People involved{" "}
            <span className="font-normal text-faint">
              (names, roles — witnesses too)
            </span>
          </span>
          <textarea
            value={peopleInvolved}
            onChange={(e) => setPeopleInvolved(e.target.value)}
            rows={2}
            className="rounded-xl border border-line px-3 py-2 text-base"
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium">Actions taken</span>
          <textarea
            value={actionsTaken}
            onChange={(e) => setActionsTaken(e.target.value)}
            rows={2}
            className="rounded-xl border border-line px-3 py-2 text-base"
          />
        </label>
      </Card>

      <Alert tone="info" icon>
        Submitting emails this report to {recipientsHint} with a copy to you;
        replies go to you. Incident reports are not stored in the app.
      </Alert>

      <div className="flex gap-2">
        <Button
          size="lg"
          onClick={submit}
          disabled={
            isPending || !resident || !description.trim() || !date || !time
          }
        >
          {isPending ? "Sending…" : "Send incident report"}
        </Button>
        <Button
          variant="subtle"
          size="lg"
          onClick={() => router.push("/")}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
