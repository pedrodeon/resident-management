"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  addResident,
  updateResident,
  deleteOccupancy,
  setOccupancyArchived,
  setCurrentTerm,
  type ResidentInput,
} from "@/app/(app)/admin/residents/actions";
import type { OccupancyStatus } from "@/lib/types";

export type RoomChoice = { id: string; label: string };

/** One stay, flattened with its person's details for the form. */
export type AdminOccupancy = ResidentInput & {
  id: string;
  person_id: string;
  term: string;
  occupancy_status: OccupancyStatus;
  is_archived: boolean;
  room_label: string;
};

const EMPTY: ResidentInput = {
  full_name: "",
  student_id: "",
  room_id: "",
  phone: "",
  emergency_contact: "",
};

const STATUS_LABEL: Record<OccupancyStatus, string> = {
  expected: "expected",
  checked_in: "checked in",
  checked_out: "checked out",
};

export function ResidentsManager({
  stays,
  rooms,
  currentTerm,
}: {
  stays: AdminOccupancy[];
  rooms: RoomChoice[];
  currentTerm: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    onOk?: () => void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else onOk?.();
    });
  }

  // Current term first, then past terms — the everyday roster is what the RD
  // is usually here for.
  const current = stays.filter((s) => s.term === currentTerm && !s.is_archived);
  const other = stays.filter((s) => s.term !== currentTerm || s.is_archived);

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md border-l-4 border-navy bg-gray-50 px-3 py-2 text-sm text-ink">
          {notice}
        </p>
      )}

      <TermControl
        currentTerm={currentTerm}
        disabled={isPending}
        onSave={(term) =>
          run(() => setCurrentTerm(term), () =>
            setNotice(`Current term is now ${term.trim()}.`),
          )
        }
      />

      <ResidentFields
        title="Add a stay"
        hint="Matched on student ID: if we've housed this person before, their record is reused and a new stay is opened for the current term."
        rooms={rooms}
        submitLabel="Add stay"
        disabled={isPending || !currentTerm}
        onSubmit={(input, reset) =>
          run(
            async () => {
              const res = await addResident(input);
              if (res.ok) {
                setNotice(
                  res.reusedPerson
                    ? `${res.personName} already had a person record — added a new stay for ${currentTerm}.`
                    : `Added ${res.personName} for ${currentTerm}.`,
                );
              }
              return res;
            },
            reset,
          )
        }
      />

      <StayList
        heading={`${current.length} ${current.length === 1 ? "stay" : "stays"} — ${currentTerm || "no term set"}`}
        stays={current}
        rooms={rooms}
        editingId={editingId}
        isPending={isPending}
        onEdit={(id) => {
          setEditingId(id);
          setError(null);
        }}
        onCancelEdit={() => setEditingId(null)}
        onSave={(stay, input) =>
          run(() => updateResident(stay.id, stay.person_id, input), () =>
            setEditingId(null),
          )
        }
        onArchive={(stay) => run(() => setOccupancyArchived(stay.id, true))}
        onUnarchive={(stay) => run(() => setOccupancyArchived(stay.id, false))}
        onDelete={(stay) => run(() => deleteOccupancy(stay.id))}
      />

      {other.length > 0 && (
        <StayList
          heading={`${other.length} past or archived ${other.length === 1 ? "stay" : "stays"}`}
          note="Hidden from the dashboard, hallway and room screens — kept for dispute history."
          stays={other}
          rooms={rooms}
          editingId={editingId}
          isPending={isPending}
          onEdit={(id) => {
            setEditingId(id);
            setError(null);
          }}
          onCancelEdit={() => setEditingId(null)}
          onSave={(stay, input) =>
            run(() => updateResident(stay.id, stay.person_id, input), () =>
              setEditingId(null),
            )
          }
          onArchive={(stay) => run(() => setOccupancyArchived(stay.id, true))}
          onUnarchive={(stay) => run(() => setOccupancyArchived(stay.id, false))}
          onDelete={(stay) => run(() => deleteOccupancy(stay.id))}
        />
      )}
    </div>
  );
}

function TermControl({
  currentTerm,
  disabled,
  onSave,
}: {
  currentTerm: string;
  disabled: boolean;
  onSave: (term: string) => void;
}) {
  const [term, setTerm] = useState(currentTerm);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Current term</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Everyday screens show only this term&rsquo;s stays. Changing it rolls the
        building over — nothing is deleted.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Term</span>
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Fall 2026"
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
        <button
          type="button"
          onClick={() => onSave(term)}
          disabled={disabled || term.trim() === "" || term.trim() === currentTerm}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
        >
          Save term
        </button>
      </div>
    </div>
  );
}

function StayList({
  heading,
  note,
  stays,
  rooms,
  editingId,
  isPending,
  onEdit,
  onCancelEdit,
  onSave,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  heading: string;
  note?: string;
  stays: AdminOccupancy[];
  rooms: RoomChoice[];
  editingId: string | null;
  isPending: boolean;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (stay: AdminOccupancy, input: ResidentInput) => void;
  onArchive: (stay: AdminOccupancy) => void;
  onUnarchive: (stay: AdminOccupancy) => void;
  onDelete: (stay: AdminOccupancy) => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {heading}
      </h2>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
      {stays.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">Nothing here yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {stays.map((stay) =>
            editingId === stay.id ? (
              <li key={stay.id} className="p-4">
                <ResidentFields
                  title={`Edit ${stay.full_name} — ${stay.term}`}
                  rooms={rooms}
                  initial={stay}
                  submitLabel="Save"
                  disabled={isPending}
                  onCancel={onCancelEdit}
                  onSubmit={(input) => onSave(stay, input)}
                />
              </li>
            ) : (
              <li
                key={stay.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div>
                  <Link
                    href={`/residents/${stay.id}`}
                    className="text-sm font-medium hover:text-navy hover:underline"
                  >
                    {stay.full_name}
                  </Link>
                  <p className="mt-0.5 text-xs text-gray-500">
                    <span className="font-mono">{stay.student_id}</span> ·{" "}
                    {stay.room_label} · {stay.term} ·{" "}
                    {STATUS_LABEL[stay.occupancy_status]}
                    {stay.is_archived && (
                      <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 font-medium text-ink">
                        archived
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(stay.id)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  {stay.is_archived ? (
                    <button
                      type="button"
                      onClick={() => onUnarchive(stay)}
                      disabled={isPending}
                      className="rounded-md border border-navy px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy hover:text-white disabled:opacity-50"
                    >
                      Unarchive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onArchive(stay)}
                      disabled={isPending}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Archive
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${stay.full_name}'s ${stay.term} stay and its events? Archiving keeps the history instead.`,
                        )
                      ) {
                        onDelete(stay);
                      }
                    }}
                    disabled={isPending}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ResidentFields({
  title,
  hint,
  rooms,
  initial,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  title: string;
  hint?: string;
  rooms: RoomChoice[];
  initial?: ResidentInput;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (input: ResidentInput, reset: () => void) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<ResidentInput>(initial ?? EMPTY);
  function set(patch: Partial<ResidentInput>) {
    setForm((f) => ({ ...f, ...patch }));
  }
  return (
    <div className={onCancel ? "" : "rounded-lg border border-gray-200 bg-white p-4"}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name" value={form.full_name} onChange={(v) => set({ full_name: v })} />
        <Field label="Student ID" value={form.student_id} onChange={(v) => set({ student_id: v })} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Room</span>
          <select
            value={form.room_id}
            onChange={(e) => set({ room_id: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          >
            <option value="">Select a room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </label>
        <Field label="Phone" value={form.phone} onChange={(v) => set({ phone: v })} />
        <Field label="Emergency contact" value={form.emergency_contact} onChange={(v) => set({ emergency_contact: v })} />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit(form, () => setForm(EMPTY))}
          disabled={disabled}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-2 text-base"
      />
    </label>
  );
}
