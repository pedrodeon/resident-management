-- Weekly room checks: an RA rates a room's condition (four 1-5 ratings,
-- 1 = poor / 5 = excellent) plus free-text notes and prohibited items.
--
-- Same record posture as every condition snapshot in this app: append-only
-- and immutable — staff read, staff insert, nobody updates or deletes. Unlike
-- presence/occupancy there is no cache or second row to keep atomic, so a
-- plain INSERT policy suffices (no SECURITY DEFINER RPC). The policy pins
-- checked_by to the caller, so attribution can't be forged.

create table public.room_checks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  checked_by uuid not null references public.users (id),
  timestamp timestamptz not null default now(),
  floor_cleanliness int not null check (floor_cleanliness between 1 and 5),
  trash int not null check (trash between 1 and 5),
  laundry int not null check (laundry between 1 and 5),
  overall int not null check (overall between 1 and 5),
  notes text,
  prohibited_items text
);

comment on table public.room_checks is
  'Weekly RA room-condition ratings (1=poor, 5=excellent). Append-only.';

create index room_checks_room_time_idx
  on public.room_checks (room_id, timestamp desc);

alter table public.room_checks enable row level security;

create policy "staff read room checks" on public.room_checks
  for select to authenticated using (public.is_staff());

-- Any staff may record a check, but only as themselves.
create policy "staff insert own room checks" on public.room_checks
  for insert to authenticated
  with check (public.is_staff() and checked_by = (select auth.uid()));

-- No update/delete policies: immutable. Grants are explicit (auto-expose is
-- off — see 20260717032303); service_role gets no delete either, matching the
-- other append-only tables.
grant select, insert on public.room_checks to authenticated;
grant select, insert on public.room_checks to service_role;
