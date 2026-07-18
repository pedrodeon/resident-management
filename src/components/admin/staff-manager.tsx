"use client";

import { useState, useTransition } from "react";
import {
  inviteStaff,
  removeStaff,
  setAssignment,
} from "@/app/(app)/admin/staff/actions";
import type { StaffRole } from "@/lib/types";

export type AdminStaff = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  hallwayIds: string[];
};
export type HallwayChoice = { id: string; name: string };

export function StaffManager({
  staff,
  hallways,
  currentUserId,
}: {
  staff: AdminStaff[];
  hallways: HallwayChoice[];
  currentUserId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<{ email: string; tempPassword: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("ra");

  function invite() {
    setError(null);
    setInvited(null);
    startTransition(async () => {
      const res = await inviteStaff(name, email, role);
      if (!res.ok) setError(res.error);
      else {
        setInvited({ email: res.email, tempPassword: res.tempPassword });
        setName("");
        setEmail("");
      }
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {invited && (
        <div className="rounded-md border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
          <p className="font-semibold">Account created for {invited.email}.</p>
          <p className="mt-1">
            Temporary password (shown once — relay it securely, they should change it):{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono">{invited.tempPassword}</code>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base">
            <option value="ra">RA</option>
            <option value="rd">RD</option>
          </select>
        </label>
        <button
          type="button"
          onClick={invite}
          disabled={isPending || !name.trim() || !email.trim()}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
        >
          Invite staff
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {staff.map((member) => (
          <li key={member.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium">{member.name}</span>
                <span className="ml-2 rounded-full bg-navy/10 px-2 py-0.5 text-xs font-medium uppercase text-navy">
                  {member.role}
                </span>
                <p className="mt-0.5 text-xs text-gray-500">{member.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${member.name}? Their login is deleted.`)) {
                    run(() => removeStaff(member.id));
                  }
                }}
                disabled={isPending || member.id === currentUserId}
                title={member.id === currentUserId ? "You can't remove yourself" : undefined}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                Remove
              </button>
            </div>

            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Hallway coverage
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {hallways.map((h) => {
                  const assigned = member.hallwayIds.includes(h.id);
                  return (
                    <label key={h.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={assigned}
                        disabled={isPending}
                        onChange={() => run(() => setAssignment(member.id, h.id, !assigned))}
                      />
                      {h.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
