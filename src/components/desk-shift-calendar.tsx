"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  acceptCoverage,
  assignShift,
  claimShift,
  releaseShift,
  requestCoverage,
  withdrawCoverage,
} from "@/app/(app)/front-desk/actions";
import {
  dateKey,
  SHIFT_SLOTS,
  shiftLabel,
  slotsOn,
  type ShiftSlot,
} from "@/lib/desk-shifts";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/typography";

type ShiftRow = {
  shift_date: string;
  slot: number;
  claimed_by: string | null;
  coverage_requested_at: string | null;
};
type StaffRow = { id: string; name: string; role: string };
type SlotState = { owner: string | null; cover: boolean };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const LOCK_MS = 24 * 60 * 60 * 1000;

/** Shift start in the viewer's local clock (server rules use Chicago time). */
function shiftStartMs(date: string, slot: ShiftSlot): number {
  const [y, m, d] = date.split("-").map(Number);
  const hour = SHIFT_SLOTS.find((s) => s.slot === slot)!.startHour;
  return new Date(y, m - 1, d, hour).getTime();
}

/**
 * The monthly grid + coverage flows. Presentation-side rules only — the RPCs
 * re-check everything (staff, ownership, the 24-hour lock, the accept race),
 * so a stale tab can't cheat, it just gets the server's refusal as an error
 * banner. Losing an accept race surfaces here as "already covered".
 */
export function DeskShiftCalendar({
  year,
  month,
  shifts,
  staff,
  meId,
  isRd,
  nowMs,
}: {
  year: number;
  month: number; // 1–12
  shifts: ShiftRow[];
  staff: StaffRow[];
  meId: string | null;
  isRd: boolean;
  /** Server render time — lock states derive from it, keeping render pure.
      Every shift action revalidates the page, so it stays current. */
  nowMs: number;
}) {
  const [error, setError] = useState<string | null>(null);
  // RD assignment target, or null when the picker is closed.
  const [picking, setPicking] = useState<{ date: string; slot: ShiftSlot } | null>(null);
  // Own-shift action panel (release / request coverage / withdraw).
  const [ownPanel, setOwnPanel] = useState<{ date: string; slot: ShiftSlot } | null>(null);
  const [, startTransition] = useTransition();

  const base = new Map<string, SlotState>();
  for (const row of shifts) {
    if (row.claimed_by) {
      base.set(`${row.shift_date}|${row.slot}`, {
        owner: row.claimed_by,
        cover: row.coverage_requested_at !== null,
      });
    }
  }
  const [optimistic, applyOptimistic] = useOptimistic(
    base,
    (state, update: { key: string; value: SlotState | null }) => {
      const copy = new Map(state);
      if (update.value) copy.set(update.key, update.value);
      else copy.delete(update.key);
      return copy;
    },
  );

  const nameOf = new Map(staff.map((s) => [s.id, s.name]));

  function run(
    key: string,
    value: SlotState | null,
    call: () => Promise<{ ok: boolean } & { error?: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ key, value });
      const result = await call();
      if (!result.ok && result.error) setError(result.error);
    });
  }

  function slotState(date: string, slot: ShiftSlot): SlotState {
    return optimistic.get(`${date}|${slot}`) ?? { owner: null, cover: false };
  }

  function onSlotTap(date: string, slot: ShiftSlot, locked: boolean) {
    const { owner, cover } = slotState(date, slot);
    if (isRd) {
      // The RD always gets the picker — assign, reassign, or clear, any time.
      setPicking({ date, slot });
      setOwnPanel(null);
      return;
    }
    const key = `${date}|${slot}`;
    if (owner === meId && owner !== null) {
      // Two possible actions on one chip — open the panel to choose.
      setOwnPanel({ date, slot });
      return;
    }
    if (cover) {
      // Someone else's shift that needs cover: tapping accepts it.
      run(key, { owner: meId, cover: false }, () => acceptCoverage(date, slot));
      return;
    }
    if (owner === null && !locked) {
      run(key, { owner: meId, cover: false }, () => claimShift(date, slot));
    }
  }

  function onAssign(userId: string | null) {
    if (!picking) return;
    const { date, slot } = picking;
    setPicking(null);
    run(
      `${date}|${slot}`,
      userId ? { owner: userId, cover: false } : null,
      () => assignShift(date, slot, userId),
    );
  }

  // Own-shift panel actions.
  function onRelease() {
    if (!ownPanel) return;
    const { date, slot } = ownPanel;
    setOwnPanel(null);
    run(`${date}|${slot}`, null, () => releaseShift(date, slot));
  }
  function onCoverage(requesting: boolean) {
    if (!ownPanel) return;
    const { date, slot } = ownPanel;
    setOwnPanel(null);
    run(
      `${date}|${slot}`,
      { owner: meId, cover: requesting },
      () => (requesting ? requestCoverage(date, slot) : withdrawCoverage(date, slot)),
    );
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

  // Open coverage requests this month, for the strip (optimistic view).
  const needsCover = [...optimistic.entries()]
    .filter(([, v]) => v.cover)
    .map(([key, v]) => {
      const [date, slot] = key.split("|");
      return { date, slot: Number(slot) as ShiftSlot, owner: v.owner };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);

  const ownPanelState = ownPanel ? slotState(ownPanel.date, ownPanel.slot) : null;
  const ownPanelLocked = ownPanel
    ? shiftStartMs(ownPanel.date, ownPanel.slot) - nowMs < LOCK_MS
    : false;

  return (
    <div className="mt-4">
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}

      {/* Shifts needing cover — the one orange-accent state on this screen. */}
      {needsCover.length > 0 && (
        <div className="mb-4">
          <SectionLabel className="text-[15px]">Needs coverage</SectionLabel>
          <ul className="mt-2 space-y-2">
            {needsCover.map(({ date, slot, owner }) => {
              const ownerName = owner ? (nameOf.get(owner) ?? "staff") : "staff";
              const mine = owner !== null && owner === meId;
              return (
                <li
                  key={`${date}|${slot}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={ownerName} size="sm" />
                    <p className="text-sm text-ink">
                      <span className="font-semibold">{shiftLabel(date, slot)}</span>
                      {" · "}
                      {mine ? "your shift" : ownerName}
                    </p>
                  </div>
                  {mine ? (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => {
                        setOwnPanel(null);
                        run(`${date}|${slot}`, { owner: meId, cover: false }, () =>
                          withdrawCoverage(date, slot),
                        );
                      }}
                    >
                      Withdraw
                    </Button>
                  ) : (
                    <Button
                      variant="attention"
                      size="sm"
                      onClick={() =>
                        run(`${date}|${slot}`, { owner: meId, cover: false }, () =>
                          acceptCoverage(date, slot),
                        )
                      }
                    >
                      Accept
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {picking && (
        <div className="mb-3 rounded-xl border border-line bg-chip p-3">
          <p className="text-xs font-semibold text-muted">
            Assign {shiftLabel(picking.date, picking.slot)}
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

      {ownPanel && ownPanelState && (
        <div className="mb-3 rounded-xl border border-line bg-chip p-3">
          <p className="text-xs font-semibold text-muted">
            Your shift — {shiftLabel(ownPanel.date, ownPanel.slot)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={ownPanelLocked}
              title={
                ownPanelLocked
                  ? "Inside 24 hours you can't leave the shift open — request coverage instead"
                  : undefined
              }
              onClick={onRelease}
            >
              Release shift
            </Button>
            {ownPanelState.cover ? (
              <Button variant="subtle" size="sm" onClick={() => onCoverage(false)}>
                Withdraw coverage request
              </Button>
            ) : (
              <Button variant="attention" size="sm" onClick={() => onCoverage(true)}>
                Request coverage
              </Button>
            )}
            <Button variant="subtle" size="sm" onClick={() => setOwnPanel(null)}>
              Cancel
            </Button>
          </div>
          {ownPanelLocked && (
            <p className="mt-2 text-xs text-muted">
              This shift starts in under 24 hours — you stay assigned until
              someone accepts your coverage request.
            </p>
          )}
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
          const scheduled = slotsOn(date);
          const offNight = scheduled.length === 0;
          // The schedule decides what can be claimed; a shift someone already
          // holds renders regardless, so dropping a night never hides who
          // worked it. Off-schedule slots therefore only ever appear taken.
          const visibleSlots = SHIFT_SLOTS.filter(
            ({ slot }) =>
              scheduled.includes(slot) || slotState(date, slot).owner !== null,
          );
          return (
            <div
              key={date}
              className={`flex min-h-[72px] flex-col gap-1 rounded-lg border p-1 ${
                offNight ? "border-line/50 bg-chip/40" : "border-line"
              }`}
            >
              {/* The date, visible but quiet — the shifts are the content. */}
              <p
                className={`text-right text-[10px] leading-none ${
                  isToday
                    ? "font-bold text-navy"
                    : offNight
                      ? "text-faint/50"
                      : "text-faint"
                }`}
              >
                {day}
              </p>
              {visibleSlots.map(({ slot, label, short, startHour }) => {
                const { owner, cover } = slotState(date, slot);
                const start = new Date(year, month - 1, day, startHour).getTime();
                const locked = start - nowMs < LOCK_MS;
                const started = start <= nowMs;
                const mine = owner !== null && owner === meId;
                const ownerName = owner ? (nameOf.get(owner) ?? "staff") : null;

                // What a tap would do decides whether this renders tappable:
                // RD → picker; mine → action panel; needs-cover → accept;
                // open+unlocked → claim.
                const tappable =
                  isRd ||
                  mine ||
                  (cover && !started) ||
                  (owner === null && !locked);
                const title = owner
                  ? cover
                    ? `${label} — ${ownerName} needs coverage${mine ? " (your request)" : " — tap to accept"}`
                    : `${label} — ${ownerName}${mine ? " (you — tap for actions)" : ""}`
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
                    onClick={() => onSlotTap(date, slot, locked)}
                    className={`flex h-6 items-center justify-center rounded-full [touch-action:manipulation] ${
                      owner
                        ? cover
                          ? "ring-2 ring-accent-deep"
                          : mine
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
        Tap an open slot to claim it
        {isRd ? "; as RD, tap any slot to assign or clear it" : ""}. Greyed
        days aren&rsquo;t staffed, so they have no slots to claim — a shift
        already held on one still shows, and can still be released or covered.
        Tap your own circle for actions. Shifts lock 24 hours before start —
        inside the window, requesting coverage is the only way out, and you
        stay on the shift until someone accepts. Orange means a shift needs
        cover: tap it (or Accept above) to take it.
      </p>
    </div>
  );
}
