"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createResident,
  updateResident,
  deleteResident,
  type ResidentInput,
} from "@/app/(app)/admin/residents/actions";

export type RoomChoice = { id: string; label: string };
export type AdminResident = ResidentInput & { id: string; room_label: string };

const EMPTY: ResidentInput = {
  full_name: "",
  student_id: "",
  room_id: "",
  phone: "",
  emergency_contact: "",
};

export function ResidentsManager({
  residents,
  rooms,
}: {
  residents: AdminResident[];
  rooms: RoomChoice[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else onOk?.();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <ResidentFields
        title="Add resident"
        rooms={rooms}
        submitLabel="Add resident"
        disabled={isPending}
        onSubmit={(input, reset) => run(() => createResident(input), reset)}
      />

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {residents.length} residents
        </h2>
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {residents.map((r) =>
            editingId === r.id ? (
              <li key={r.id} className="p-4">
                <ResidentFields
                  title={`Edit ${r.full_name}`}
                  rooms={rooms}
                  initial={r}
                  submitLabel="Save"
                  disabled={isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(input) =>
                    run(() => updateResident(r.id, input), () => setEditingId(null))
                  }
                />
              </li>
            ) : (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <Link href={`/residents/${r.id}`} className="text-sm font-medium hover:text-navy hover:underline">
                    {r.full_name}
                  </Link>
                  <p className="mt-0.5 text-xs text-gray-500">
                    <span className="font-mono">{r.student_id}</span> · {r.room_label}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingId(r.id); setError(null); }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete ${r.full_name}? This cannot be undone.`)) {
                        run(() => deleteResident(r.id));
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
      </div>
    </div>
  );
}

function ResidentFields({
  title,
  rooms,
  initial,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  title: string;
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
