"use client";

import { useOptimistic, useState, useTransition } from "react";
import { assignShift, claimShift, releaseShift } from "@/app/(app)/front-desk/actions";
import { dateKey, SHIFT_SLOTS, type ShiftSlot } from "@/lib/desk-shifts";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ShiftRow = { shift_date: string; slot: number; claimed_by: string | null };
type StaffRow = { id: string; name: string; role: string };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const LOCK_MS = 24 * 60 * 60 * 1000;

/**
 * The monthly grid. Presentation-side rules only — the RPCs re-check
 * everything (staff, ownership, the 24-hour lock), so a stale tab can't
 * cheat, it just gets the server's refusal as an error banner.
 */
export function DeskShiftCalendar({
  year,
  month,
  shifts,
  staff,
  meId,
  isRd,
}: {
  year: number;
  month: number; // 1–12
  shifts: ShiftRow[];
  staff: StaffRow[];
  meId: string | null;
  isRd: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  // RD assignment target, or null when the picker is closed.
  const [picking, setPicking] = useState<{ date: string; slot: ShiftSlot } | null>(null);
  const [, startTransition] = useTransition();

  const claimed = new Map<string, string>();
  for (const row of shifts) {
    if (row.claimed_by) claimed.set(`${row.shift_date}|${row.slot}`, row.claimed_by);
  }
  const [optimistic, applyOptimistic] = useOptimistic(
    claimed,
    (state, update: { key: string; userId: string | null }) => {
      const copy = new Map(state);
      if (update.userId) copy.set(update.key, update.userId);
      else copy.delete(update.key);
      return copy;
    },
  );

  const nameOf = new Map(staff.map((s) => [s.id, s.name]));

  function run(key: string, userId: string | null, call: () => Promise<{ ok: boolean } & { error?: string }>) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ key, userId });
      const result = await call();
      if (!result.ok && result.error) setError(result.error);
    });
  }

  function onSlotTap(date: string, slot: ShiftSlot, owner: string | null, locked: boolean) {
    if (isRd) {
      // The RD always gets the picker — assign, reassign, or clear, any time.
      setPicking({ date, slot });
      return;
    }
    if (locked) return;
    const key = `${date}|${slot}`;
    if (owner === null) run(key, meId, () => claimShift(date, slot));
    else if (owner === meId) run(key, null, () => releaseShift(date, slot));
    // Someone else's shift: nothing to do in part 1 (coverage requests are part 2).
  }

  function onAssign(userId: string | null) {
    if (!picking) return;
    const { date, slot } = picking;
    setPicking(null);
    run(`${date}|${slot}`, userId, () => assignShift(date, slot, userId));
  }

  // Calendar geometry — plain local dates, no timezone math.
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = new Date(year, month - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const today = new Date();
  const isThisMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;

  return (
    <div className="mt-4">
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}

      {picking && (
        <div className="mb-3 rounded-xl border border-line bg-chip p-3">
          <p className="text-xs font-semibold text-muted">
            Assign {picking.date} ·{" "}
            {SHIFT_SLOTS.find((s) => s.slot === picking.slot)?.label}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {staff.map((s) => (
              <Button
                key={s.id}
                variant="outline"
                size="sm"
                onClick={() => onAssign(s.id)}
              >
                {s.name}
              </Button>
            ))}
            <Button variant="subtle" size="sm" onClick={() => onAssign(null)}>
              Open
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setPicking(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <p key={i} className="text-[10px] font-semibold uppercase text-faint">
            {d}
          </p>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />;
          const date = dateKey(year, month, day);
          const isToday = isThisMonth && day === today.getDate();
          return (
            <div
              key={date}
              className="flex min-h-[72px] flex-col gap-1 rounded-lg border border-line p-1"
            >
              {/* The date, visible but quiet — the shifts are the content. */}
              <p
                className={`text-right text-[10px] leading-none ${
                  isToday ? "font-bold text-navy" : "text-faint"
                }`}
              >
                {day}
              </p>
              {SHIFT_SLOTS.map(({ slot, label, short, startHour }) => {
                const owner = optimistic.get(`${date}|${slot}`) ?? null;
                const start = new Date(year, month - 1, day, startHour);
                const locked = start.getTime() - Date.now() < LOCK_MS;
                const mine = owner !== null && owner === meId;
                const ownerName = owner ? (nameOf.get(owner) ?? "staff") : null;

                // What a tap would do decides whether this renders tappable.
                const tappable = isRd || (!locked && (owner === null || mine));
                const title = owner
                  ? `${label} — ${ownerName}${mine ? " (you — tap to release)" : ""}${
                      locked && !isRd ? " · locked (<24 h)" : ""
                    }`
                  : locked && !isRd
                    ? `${label} — open, but locked (<24 h). Ask the RD.`
                    : `${label} — open, tap to claim`;

                return (
                  <button
                    key={slot}
                    type="button"
                    title={title}
                    aria-label={title}
                    disabled={!tappable}
                    onClick={() => onSlotTap(date, slot, owner, locked)}
                    className={`flex h-6 items-center justify-center rounded-full [touch-action:manipulation] ${
                      owner
                        ? mine
                          ? "ring-2 ring-navy/35"
                          : ""
                        : `border border-dashed text-[9px] font-semibold ${
                            locked && !isRd
                              ? "border-line text-faint/60"
                              : "border-faint text-muted hover:border-navy hover:text-navy"
                          }`
                    } ${tappable ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {owner ? (
                      <Avatar name={ownerName!} size="sm" />
                    ) : (
                      <span>{short}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="mt-3 px-1 text-xs text-muted">
        Tap an open slot to claim it{isRd ? "; as RD, tap any slot to assign or clear it" : ""}.
        Tap your own circle to release. Shifts lock 24 hours before start
        {isRd ? " for self-service — your assignments have no lock" : " — after that, ask the RD"}.
      </p>
    </div>
  );
}
