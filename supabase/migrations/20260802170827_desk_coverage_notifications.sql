-- Front Desk scheduling, part 2: coverage requests + in-app notifications.
--
-- A coverage request is a FLAG on a claimed shift — the owner stays assigned
-- (the desk is never left unstaffed by an opt-out) until another staff member
-- accepts, which transfers the shift and closes the request in one atomic
-- update. Inside the 24-hour lock this is the ONLY way out of a shift; the
-- part-1 lock on release already enforces that half of the rule.
--
-- Notifications are broadcast rows (one per event, not per recipient),
-- written inside the same transaction as the change they describe. Read
-- state is a per-user watermark, not per-notification rows. Staff-only
-- scheduling data — nothing here touches residents.

alter table public.desk_shifts
  add column coverage_requested_at timestamptz,
  add constraint coverage_needs_owner
    check (coverage_requested_at is null or claimed_by is not null);

-- ---------------------------------------------------------------------------
-- notifications — the feed
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- text + check (not an enum) so part 3 event types need no type migration.
  type text not null check (type in (
    'claimed', 'released', 'coverage_requested', 'coverage_withdrawn',
    'coverage_accepted', 'assigned'
  )),
  shift_date date not null,
  slot int not null check (slot in (1, 2)),
  actor uuid not null references public.users (id),
  other_user uuid references public.users (id),
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Staff schedule notifications, one broadcast row per event. Written only '
  'inside the desk-shift RPCs; the UI renders the sentence from the fields.';

create index notifications_created_idx
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;

-- Staff read the feed; nobody writes directly — rows are inserted by the
-- definer RPCs below (as the function owner), same transaction as the change.
create policy "staff read notifications" on public.notifications
  for select to authenticated using (public.is_staff());

grant select on public.notifications to authenticated;
grant select on public.notifications to service_role;

-- ---------------------------------------------------------------------------
-- notification_seen — one watermark per user
-- ---------------------------------------------------------------------------

create table public.notification_seen (
  user_id uuid primary key references public.users (id),
  seen_at timestamptz not null default now()
);

alter table public.notification_seen enable row level security;

create policy "own seen row read" on public.notification_seen
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own seen row insert" on public.notification_seen
  for insert to authenticated
  with check (public.is_staff() and user_id = (select auth.uid()));
create policy "own seen row update" on public.notification_seen
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.notification_seen to authenticated;
grant select on public.notification_seen to service_role;

-- ---------------------------------------------------------------------------
-- notify_desk — private insert helper (only the RPCs call it)
-- ---------------------------------------------------------------------------

create function public.notify_desk(
  event_type text,
  target_date date,
  target_slot int,
  event_actor uuid,
  event_other uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (type, shift_date, slot, actor, other_user)
  values (event_type, target_date, target_slot, event_actor, event_other);
$$;

revoke execute on function public.notify_desk(text, date, int, uuid, uuid)
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- request_shift_coverage — flag/unflag your own shift, any time before start
-- ---------------------------------------------------------------------------

create function public.request_shift_coverage(
  target_date date,
  target_slot int,
  requesting boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  current_owner uuid;
  current_flag timestamptz;
begin
  if not public.is_staff() then
    raise exception 'only staff may manage desk shifts'
      using errcode = 'insufficient_privilege';
  end if;

  select claimed_by, coverage_requested_at
    into current_owner, current_flag
    from public.desk_shifts
    where shift_date = target_date and slot = target_slot
    for update;

  if current_owner is null or current_owner <> caller then
    raise exception 'you can only request coverage for a shift you hold'
      using errcode = 'check_violation';
  end if;

  if now() >= public.desk_shift_start(target_date, target_slot) then
    raise exception 'that shift has already started'
      using errcode = 'check_violation';
  end if;

  -- Deliberately NO 24-hour lock here, either way: requesting inside 24 h is
  -- the whole point, and withdrawing keeps the owner assigned.
  if requesting then
    if current_flag is not null then
      raise exception 'coverage is already requested for that shift'
        using errcode = 'check_violation';
    end if;
    update public.desk_shifts set coverage_requested_at = now()
      where shift_date = target_date and slot = target_slot;
    perform public.notify_desk('coverage_requested', target_date, target_slot, caller);
  else
    if current_flag is null then
      raise exception 'there is no open coverage request on that shift'
        using errcode = 'check_violation';
    end if;
    update public.desk_shifts set coverage_requested_at = null
      where shift_date = target_date and slot = target_slot;
    perform public.notify_desk('coverage_withdrawn', target_date, target_slot, caller);
  end if;
end;
$$;

revoke execute on function public.request_shift_coverage(date, int, boolean) from anon;

-- ---------------------------------------------------------------------------
-- accept_shift_coverage — first-come-first-served transfer
-- ---------------------------------------------------------------------------

create function public.accept_shift_coverage(
  target_date date,
  target_slot int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  previous_owner uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may accept coverage'
      using errcode = 'insufficient_privilege';
  end if;

  -- The row lock serializes racing accepts: the loser blocks here, then
  -- re-reads a row whose flag is already null and gets the clear error.
  select claimed_by into previous_owner
    from public.desk_shifts
    where shift_date = target_date and slot = target_slot
      and coverage_requested_at is not null
    for update;

  if previous_owner is null then
    raise exception 'that shift was already covered'
      using errcode = 'check_violation';
  end if;

  if previous_owner = caller then
    raise exception 'you already hold that shift — withdraw the request instead'
      using errcode = 'check_violation';
  end if;

  if now() >= public.desk_shift_start(target_date, target_slot) then
    raise exception 'that shift has already started'
      using errcode = 'check_violation';
  end if;

  -- No 24-hour lock: accepting inside the window FILLS a gap.
  update public.desk_shifts
    set claimed_by = caller, claimed_at = now(), coverage_requested_at = null
    where shift_date = target_date and slot = target_slot;

  perform public.notify_desk(
    'coverage_accepted', target_date, target_slot, caller, previous_owner);
end;
$$;

revoke execute on function public.accept_shift_coverage(date, int) from anon;

-- ---------------------------------------------------------------------------
-- claim_desk_shift — part-1 rules unchanged; adds notifications and clears
-- the coverage flag on release
-- ---------------------------------------------------------------------------

create or replace function public.claim_desk_shift(
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
  caller uuid := (select auth.uid());
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

  -- The opt-out rule's teeth: inside 24 h neither claiming nor releasing is
  -- allowed here — request_shift_coverage is the only way out of a shift.
  if now() > public.desk_shift_start(target_date, target_slot) - interval '24 hours' then
    raise exception
      'shifts lock 24 hours before they start — request coverage instead'
      using errcode = 'check_violation';
  end if;

  if claiming then
    insert into public.desk_shifts (shift_date, slot, claimed_by, claimed_at)
    values (target_date, target_slot, caller, now())
    on conflict (shift_date, slot) do update
      set claimed_by = excluded.claimed_by, claimed_at = excluded.claimed_at
      where public.desk_shifts.claimed_by is null
         or public.desk_shifts.claimed_by = excluded.claimed_by
    returning id into affected;
    if affected is null then
      raise exception 'that shift was already claimed'
        using errcode = 'check_violation';
    end if;
    perform public.notify_desk('claimed', target_date, target_slot, caller);
  else
    -- Releasing also closes any open coverage request — the shift is simply
    -- open again, which is strictly easier to fill.
    update public.desk_shifts
      set claimed_by = null, claimed_at = null, coverage_requested_at = null
      where shift_date = target_date and slot = target_slot
        and claimed_by = caller
    returning id into affected;
    if affected is null then
      raise exception 'you can only release a shift you claimed'
        using errcode = 'check_violation';
    end if;
    perform public.notify_desk('released', target_date, target_slot, caller);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_desk_shift — part-1 rules unchanged; closes coverage requests and
-- notifies (this is the RD force-fill)
-- ---------------------------------------------------------------------------

create or replace function public.set_desk_shift(
  target_date date,
  target_slot int,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  previous_owner uuid;
begin
  if not public.is_rd() then
    raise exception 'only the RD may assign desk shifts'
      using errcode = 'insufficient_privilege';
  end if;

  if target_slot not in (1, 2) then
    raise exception 'slot must be 1 (6-8 PM) or 2 (8-10 PM)'
      using errcode = 'check_violation';
  end if;

  select claimed_by into previous_owner
    from public.desk_shifts
    where shift_date = target_date and slot = target_slot
    for update;

  -- No timing rule on purpose; an assignment also closes any open request.
  insert into public.desk_shifts (shift_date, slot, claimed_by, claimed_at)
  values (
    target_date, target_slot, target_user,
    case when target_user is null then null else now() end
  )
  on conflict (shift_date, slot) do update
    set claimed_by = excluded.claimed_by,
        claimed_at = excluded.claimed_at,
        coverage_requested_at = null;

  perform public.notify_desk(
    'assigned', target_date, target_slot, caller,
    coalesce(target_user, previous_owner));
end;
$$;
