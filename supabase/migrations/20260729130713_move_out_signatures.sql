-- Two-signature step for move-out inspections, mirroring move-in, with one
-- documented escape hatch: residents leave early or refuse to sign, so the RA
-- may record "resident unavailable / declined to sign" WITH a required reason.
-- That waiver satisfies the resident half of the check-out gate while making
-- the absence explicit and permanent. The RA signature is never waivable, and
-- no waiver exists for move-in (the resident is present by definition there).

-- ---------------------------------------------------------------------------
-- inspection_signature_waivers — the recorded absence of a resident signature
-- ---------------------------------------------------------------------------
-- Its own table rather than a flag on inspection_signatures: a waiver has no
-- image, and a nullable storage_path would weaken the invariant every real
-- signature relies on.

create table public.inspection_signature_waivers (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null unique references public.inspections (id) on delete cascade,
  reason text not null,
  waived_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  -- The reason is required, not decorative.
  check (btrim(reason) <> '')
);

comment on table public.inspection_signature_waivers is
  'RA-recorded "resident unavailable / declined to sign" on a move-out '
  'inspection, with the reason. One per inspection; immutable.';

alter table public.inspection_signature_waivers enable row level security;

create policy "staff read signature waivers" on public.inspection_signature_waivers
  for select to authenticated using (public.is_staff());

-- Staff may record a waiver, only as themselves, and only against a move-out
-- inspection that names a resident.
create policy "staff insert signature waivers" on public.inspection_signature_waivers
  for insert to authenticated
  with check (
    public.is_staff()
    and waived_by = (select auth.uid())
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and i.type = 'move_out'
        and i.resident_id is not null
    )
  );

-- No update/delete: permanent, like the signatures it stands in for.
grant select, insert on public.inspection_signature_waivers to authenticated;
grant select, insert on public.inspection_signature_waivers to service_role;

-- ---------------------------------------------------------------------------
-- Signatures now apply to move-out inspections too
-- ---------------------------------------------------------------------------

drop policy "staff insert inspection signatures" on public.inspection_signatures;
create policy "staff insert inspection signatures" on public.inspection_signatures
  for insert to authenticated
  with check (
    public.is_staff()
    and captured_by = (select auth.uid())
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and i.type in ('move_in', 'move_out')
        and i.resident_id is not null
    )
  );

-- ---------------------------------------------------------------------------
-- record_occupancy — check_out gains the mirrored gate
-- ---------------------------------------------------------------------------
-- check_out requires a move-out inspection with the RA signature AND either
-- the resident signature or a waiver. check_in is unchanged.

create or replace function public.record_occupancy(
  target_resident uuid,
  event_type public.occupancy_event_type,
  event_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.occupancy_status;
begin
  if not public.is_staff() then
    raise exception 'only staff may record occupancy'
      using errcode = 'insufficient_privilege';
  end if;

  select occupancy_status into current_status
    from public.residents where id = target_resident
    for update;

  if current_status is null then
    raise exception 'resident % not found', target_resident
      using errcode = 'no_data_found';
  end if;

  if event_type = 'check_in' then
    if current_status <> 'expected' then
      raise exception 'resident % cannot check in from status %', target_resident, current_status
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1
      from public.inspections i
      where i.resident_id = target_resident
        and i.type = 'move_in'
        and (
          select count(distinct s.role)
          from public.inspection_signatures s
          where s.inspection_id = i.id
        ) = 2
    ) then
      raise exception
        'check-in requires a move-in inspection signed by both the resident and the RA'
        using errcode = 'check_violation';
    end if;
    update public.residents
      set occupancy_status = 'checked_in', is_present = true
      where id = target_resident;
  else -- check_out
    if current_status <> 'checked_in' then
      raise exception 'resident % cannot check out from status %', target_resident, current_status
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1
      from public.inspections i
      where i.resident_id = target_resident
        and i.type = 'move_out'
        and exists (
          select 1 from public.inspection_signatures s
          where s.inspection_id = i.id and s.role = 'ra'
        )
        and (
          exists (
            select 1 from public.inspection_signatures s
            where s.inspection_id = i.id and s.role = 'resident'
          )
          or exists (
            select 1 from public.inspection_signature_waivers w
            where w.inspection_id = i.id
          )
        )
    ) then
      raise exception
        'check-out requires a move-out inspection signed by the RA and either signed by the resident or carrying a recorded waiver'
        using errcode = 'check_violation';
    end if;
    update public.residents
      set occupancy_status = 'checked_out', is_present = false
      where id = target_resident;
  end if;

  insert into public.occupancy_events (resident_id, type, recorded_by, note)
  values (target_resident, event_type, (select auth.uid()), event_note);
end;
$$;
