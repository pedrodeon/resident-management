-- Step 7: RD-only room reassignments.
--
-- Matters for damage attribution: room_change_events establishes which room a
-- resident occupied during which window, so a move-out inspection's damage can
-- be pinned to the right occupant. Reassignment is RD-only and flows through a
-- SECURITY DEFINER RPC that updates residents.room_id AND logs the change
-- atomically — like the other event tables, the log is the source of truth.

create table public.room_change_events (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id) on delete cascade,
  from_room_id uuid references public.rooms (id),
  to_room_id uuid not null references public.rooms (id),
  timestamp timestamptz not null default now(),
  changed_by uuid references public.users (id),
  reason text
);

comment on table public.room_change_events is
  'Append-only log of RD room reassignments. Written only via reassign_room().';

create index room_change_events_resident_time_idx
  on public.room_change_events (resident_id, timestamp desc);

alter table public.room_change_events enable row level security;

-- Staff read the history; append-only, written only through the RPC.
create policy "staff read room changes" on public.room_change_events
  for select to authenticated using (public.is_staff());

grant select on public.room_change_events to authenticated;
grant select, insert on public.room_change_events to service_role;

-- ---------------------------------------------------------------------------
-- reassign_room — move a resident, log the change (RD only)
-- ---------------------------------------------------------------------------

create function public.reassign_room(
  target_resident uuid,
  to_room uuid,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_room uuid;
begin
  if not public.is_rd() then
    raise exception 'only the RD may reassign rooms'
      using errcode = 'insufficient_privilege';
  end if;

  select room_id into from_room
    from public.residents where id = target_resident
    for update;

  if from_room is null then
    raise exception 'resident % not found', target_resident
      using errcode = 'no_data_found';
  end if;

  if from_room = to_room then
    raise exception 'resident is already in that room'
      using errcode = 'check_violation';
  end if;

  update public.residents set room_id = to_room where id = target_resident;

  insert into public.room_change_events
    (resident_id, from_room_id, to_room_id, changed_by, reason)
  values
    (target_resident, from_room, to_room, (select auth.uid()), reason);
end;
$$;

revoke execute on function public.reassign_room(uuid, uuid, text) from anon;
grant execute on function public.reassign_room(uuid, uuid, text) to authenticated;
