-- Follow-up to the staff-removal fix: desk_shifts needed a different rule.
--
-- SET NULL on claimed_by tripped two of the table's own checks — the
-- claimed_by/claimed_at pair, and "a coverage request needs an owner" — so
-- removing a staff member still failed once they had claimed any shift.
--
-- The right answer here isn't SET NULL at all. The desk schedule is a live
-- roster, not an audit log: rows materialize on claim and an OPEN slot is
-- simply the absence of a row. So when a staff member leaves, their shifts
-- should go back to being open, which is exactly what CASCADE does — the row
-- disappears and the slot is free for someone else. The audit trail of what
-- happened lives in notifications, which keeps its rows with a null actor.

alter table public.desk_shifts
  drop constraint desk_shifts_claimed_by_fkey,
  add constraint desk_shifts_claimed_by_fkey
    foreign key (claimed_by) references public.users (id) on delete cascade;
