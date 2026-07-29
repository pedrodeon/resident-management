-- Two-signature step for move-in inspections, gating check-in.
--
-- The resident signs to attest the recorded conditions are accurate; the RA
-- signs to attest they conducted the inspection. Signatures bind to the exact
-- inspection snapshot (fk + unique per role), are immutable once captured
-- (no update/delete for any role; the unique key blocks re-insert), and
-- record_occupancy now refuses check_in until both exist — the enforcement is
-- in the database, not the UI.
--
-- Signature images live in the existing private inspection-photos bucket
-- under signatures/{inspection_id}/ — same storage RLS (staff insert+select,
-- no overwrite, no delete), so a stored signature can't be altered either.

create type public.signature_role as enum ('resident', 'ra');

create table public.inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  role public.signature_role not null,
  storage_path text not null unique,
  signed_at timestamptz not null default now(),
  captured_by uuid not null references public.users (id),
  -- One signature per role per inspection — signing twice or "fixing" a
  -- signature is impossible by construction.
  unique (inspection_id, role)
);

comment on table public.inspection_signatures is
  'Resident + RA attestations bound to one move-in inspection. Immutable.';

alter table public.inspection_signatures enable row level security;

create policy "staff read inspection signatures" on public.inspection_signatures
  for select to authenticated using (public.is_staff());

-- Staff may record a signature, only as themselves (captured_by = the staff
-- member operating the device), and only against a move-in inspection that
-- names a resident — the only kind the attestations make sense for.
create policy "staff insert inspection signatures" on public.inspection_signatures
  for insert to authenticated
  with check (
    public.is_staff()
    and captured_by = (select auth.uid())
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and i.type = 'move_in'
        and i.resident_id is not null
    )
  );

-- No update/delete policies: signatures are permanent. Explicit grants
-- (auto-expose off); service_role gets no delete either.
grant select, insert on public.inspection_signatures to authenticated;
grant select, insert on public.inspection_signatures to service_role;

-- ---------------------------------------------------------------------------
-- record_occupancy — check_in now requires a fully-signed move-in inspection
-- ---------------------------------------------------------------------------

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
    -- A check-in is not complete until the resident and the RA have both
    -- signed the move-in inspection.
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
    update public.residents
      set occupancy_status = 'checked_out', is_present = false
      where id = target_resident;
  end if;

  insert into public.occupancy_events (resident_id, type, recorded_by, note)
  values (target_resident, event_type, (select auth.uid()), event_note);
end;
$$;
