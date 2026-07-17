-- Step 2 of the build order: staff + building structure + resident roster.
-- Tables: users, hallways, hallway_assignments, rooms, residents.
-- Event tables (occupancy/presence/room_change) and inspections come in
-- later steps; residents.occupancy_status is a cache whose source of truth
-- (occupancy_events) arrives in step 5.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.staff_role as enum ('rd', 'ra');
create type public.wing as enum ('holiday', 'lebanon');
create type public.occupancy_status as enum ('expected', 'checked_in', 'checked_out');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Staff only (the RD and the RAs). Residents never log in — they are records
-- in `residents`, not user accounts.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.staff_role not null default 'ra'
);

comment on table public.users is
  'Staff accounts (RD + RAs), 1:1 with auth.users. Residents are never users.';

create table public.hallways (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  wing public.wing not null,
  floor int not null check (floor between 1 and 3),
  section text check (section in ('A', 'B')),
  sort_order int not null unique
);

comment on table public.hallways is
  'The 8 hallways of Tudor Hall. Hallway — not floor — is the organizing unit.';

-- Metadata only — NOT access control. Shows "RA: Jane Doe" on a hallway.
-- Coverage is not 1:1 (8 hallways, 7 RAs): an RA may cover two hallways, or
-- the RD may cover one. Every staff member can access every hallway.
create table public.hallway_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  hallway_id uuid not null references public.hallways (id) on delete cascade,
  unique (user_id, hallway_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  hallway_id uuid not null references public.hallways (id),
  room_number text not null,
  capacity int not null check (capacity between 1 and 8),
  unique (hallway_id, room_number)
);

create table public.residents (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  student_id text not null unique,
  room_id uuid not null references public.rooms (id),
  phone text,
  emergency_contact text,
  -- Cache; source of truth is the latest occupancy_events row (step 5).
  occupancy_status public.occupancy_status not null default 'expected',
  -- THE LIVE TOGGLE: are they in the building right now. Only meaningful
  -- while checked_in.
  is_present boolean not null default true
);

comment on table public.residents is
  'Residents are records, not accounts. Sensitive: never expose without RLS.';

create index residents_room_id_idx on public.residents (room_id);
create index rooms_hallway_id_idx on public.rooms (hallway_id);
create index hallway_assignments_hallway_id_idx on public.hallway_assignments (hallway_id);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so policies can look up the caller's staff row without
-- recursing through the RLS policies on public.users itself.

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users where id = (select auth.uid())
  );
$$;

create function public.is_rd()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users where id = (select auth.uid()) and role = 'rd'
  );
$$;

revoke execute on function public.is_staff() from anon;
revoke execute on function public.is_rd() from anon;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
-- Deliberately simple (CLAUDE.md): NO hallway scoping. Any staff member can
-- SELECT everything; only the RD can write the roster tables.
--
-- Deferred to step 4: RAs flipping residents.is_present. That will be a
-- SECURITY DEFINER RPC (set_presence) that atomically updates the flag AND
-- inserts the presence_events row, so flag and audit trail can never diverge.
-- Until then, residents UPDATE stays RD-only.

alter table public.users enable row level security;
alter table public.hallways enable row level security;
alter table public.hallway_assignments enable row level security;
alter table public.rooms enable row level security;
alter table public.residents enable row level security;

-- users
create policy "staff can read staff" on public.users
  for select to authenticated using (public.is_staff());
create policy "rd manages staff" on public.users
  for insert to authenticated with check (public.is_rd());
create policy "rd updates staff" on public.users
  for update to authenticated using (public.is_rd()) with check (public.is_rd());
create policy "rd removes staff" on public.users
  for delete to authenticated using (public.is_rd());

-- hallways
create policy "staff can read hallways" on public.hallways
  for select to authenticated using (public.is_staff());
create policy "rd creates hallways" on public.hallways
  for insert to authenticated with check (public.is_rd());
create policy "rd updates hallways" on public.hallways
  for update to authenticated using (public.is_rd()) with check (public.is_rd());
create policy "rd deletes hallways" on public.hallways
  for delete to authenticated using (public.is_rd());

-- hallway_assignments
create policy "staff can read assignments" on public.hallway_assignments
  for select to authenticated using (public.is_staff());
create policy "rd creates assignments" on public.hallway_assignments
  for insert to authenticated with check (public.is_rd());
create policy "rd updates assignments" on public.hallway_assignments
  for update to authenticated using (public.is_rd()) with check (public.is_rd());
create policy "rd deletes assignments" on public.hallway_assignments
  for delete to authenticated using (public.is_rd());

-- rooms
create policy "staff can read rooms" on public.rooms
  for select to authenticated using (public.is_staff());
create policy "rd creates rooms" on public.rooms
  for insert to authenticated with check (public.is_rd());
create policy "rd updates rooms" on public.rooms
  for update to authenticated using (public.is_rd()) with check (public.is_rd());
create policy "rd deletes rooms" on public.rooms
  for delete to authenticated using (public.is_rd());

-- residents
create policy "staff can read residents" on public.residents
  for select to authenticated using (public.is_staff());
create policy "rd creates residents" on public.residents
  for insert to authenticated with check (public.is_rd());
create policy "rd updates residents" on public.residents
  for update to authenticated using (public.is_rd()) with check (public.is_rd());
create policy "rd deletes residents" on public.residents
  for delete to authenticated using (public.is_rd());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- The project runs with "automatically expose new tables" OFF, so be explicit.
-- anon gets nothing at all; authenticated gets table access that RLS then
-- narrows to the rules above.

revoke all on public.users, public.hallways, public.hallway_assignments,
  public.rooms, public.residents from anon;

grant select, insert, update, delete
  on public.users, public.hallways, public.hallway_assignments,
     public.rooms, public.residents
  to authenticated;
