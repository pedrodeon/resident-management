-- Front Desk scheduling, part 1: the desk is staffed in two fixed evening
-- shifts (slot 1 = 6-8 PM, slot 2 = 8-10 PM), one RA each. Staff claim open
-- shifts for themselves; the RD can assign or clear anything. STAFF data
-- only — no resident information lives here.
--
-- Rows materialize on first claim: an open shift is "no row" (or a row whose
-- claimed_by is null after a release). Nothing is pre-seeded.
--
-- The 24-HOUR RULE lives here, not in the UI: self-service claims and
-- releases are refused within 24 hours of the shift's start. Only the RD's
-- override function skips it, so last-minute gaps can still be filled.

create table public.desk_shifts (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  slot int not null check (slot in (1, 2)),
  claimed_by uuid references public.users (id),
  claimed_at timestamptz,
  -- The pair moves together: claimed has both, open has neither.
  check ((claimed_by is null) = (claimed_at is null)),
  -- One row per shift; also the race guard — two simultaneous claims of the
  -- same open shift resolve to exactly one winner.
  unique (shift_date, slot)
);

comment on table public.desk_shifts is
  'Front-desk shift claims. Slot 1 = 6-8 PM, slot 2 = 8-10 PM (America/'
  'Chicago). Open shift = missing row or null claimed_by. Writes go through '
  'claim_desk_shift / set_desk_shift only.';

alter table public.desk_shifts enable row level security;

-- Everyone on staff sees the whole schedule. No direct write policies for
-- anyone: every mutation goes through the two definer functions below, which
-- carry the timing and ownership rules.
create policy "staff read desk shifts" on public.desk_shifts
  for select to authenticated using (public.is_staff());

-- Auto-expose is off (20260717032303): grant explicitly. Read-only even for
-- service_role — the RPCs are the only write path.
grant select on public.desk_shifts to authenticated;
grant select on public.desk_shifts to service_role;

-- ---------------------------------------------------------------------------
-- desk_shift_start — one authoritative clock for the 24-hour rule
-- ---------------------------------------------------------------------------
-- The building's shifts are wall-clock times in America/Chicago; computing
-- the start here (not in JS, not in UTC arithmetic) keeps DST days honest.

create function public.desk_shift_start(target_date date, target_slot int)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select make_timestamptz(
    extract(year from target_date)::int,
    extract(month from target_date)::int,
    extract(day from target_date)::int,
    16 + target_slot * 2,  -- slot 1 -> 18:00, slot 2 -> 20:00
    0, 0, 'America/Chicago'
  );
$$;

-- ---------------------------------------------------------------------------
-- claim_desk_shift — self-service claim/release, 24-hour rule enforced
-- ---------------------------------------------------------------------------

create function public.claim_desk_shift(
  target_date date,
  target_slot int,
  claiming boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may claim desk shifts'
      using errcode = 'insufficient_privilege';
  end if;

  if target_slot not in (1, 2) then
    raise exception 'slot must be 1 (6-8 PM) or 2 (8-10 PM)'
      using errcode = 'check_violation';
  end if;

  -- The rule this feature exists for: no self-service changes within 24
  -- hours of the shift. The RD's set_desk_shift is the only way past it.
  if now() > public.desk_shift_start(target_date, target_slot) - interval '24 hours' then
    raise exception
      'shifts lock 24 hours before they start — ask the RD to change this one'
      using errcode = 'check_violation';
  end if;

  if claiming then
    -- Upsert, winning only if the shift is open (or already ours, so a
    -- double-tap is harmless). The unique key serializes racing claims.
    insert into public.desk_shifts (shift_date, slot, claimed_by, claimed_at)
    values (target_date, target_slot, (select auth.uid()), now())
    on conflict (shift_date, slot) do update
      set claimed_by = excluded.claimed_by, claimed_at = excluded.claimed_at
      where public.desk_shifts.claimed_by is null
         or public.desk_shifts.claimed_by = excluded.claimed_by
    returning id into affected;
    if affected is null then
      raise exception 'that shift was already claimed'
        using errcode = 'check_violation';
    end if;
  else
    update public.desk_shifts
      set claimed_by = null, claimed_at = null
      where shift_date = target_date and slot = target_slot
        and claimed_by = (select auth.uid())
    returning id into affected;
    if affected is null then
      raise exception 'you can only release a shift you claimed'
        using errcode = 'check_violation';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_desk_shift — RD assigns anyone (or clears), any time
-- ---------------------------------------------------------------------------

create function public.set_desk_shift(
  target_date date,
  target_slot int,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_rd() then
    raise exception 'only the RD may assign desk shifts'
      using errcode = 'insufficient_privilege';
  end if;

  if target_slot not in (1, 2) then
    raise exception 'slot must be 1 (6-8 PM) or 2 (8-10 PM)'
      using errcode = 'check_violation';
  end if;

  -- No timing rule here on purpose: the RD fills gaps inside 24 hours.
  -- target_user must be a staff row (the fk enforces it) or null to clear.
  insert into public.desk_shifts (shift_date, slot, claimed_by, claimed_at)
  values (
    target_date, target_slot, target_user,
    case when target_user is null then null else now() end
  )
  on conflict (shift_date, slot) do update
    set claimed_by = excluded.claimed_by, claimed_at = excluded.claimed_at;
end;
$$;

revoke execute on function public.desk_shift_start(date, int) from anon;
revoke execute on function public.claim_desk_shift(date, int, boolean) from anon;
revoke execute on function public.set_desk_shift(date, int, uuid) from anon;
