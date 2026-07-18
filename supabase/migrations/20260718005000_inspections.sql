-- Step 6: room inspections.
--
-- Damage control = the diff between two dated snapshots (move_in vs move_out).
-- So an inspection is an IMMUTABLE snapshot: the 12 items are a template, and
-- each inspection freezes its own copy. Any staff may create and view
-- inspections; only the RD edits the template. Snapshots are append-only —
-- never updated or deleted — which preserves the "before" state that damage
-- attribution depends on.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.inspection_type as enum ('move_in', 'move_out', 'periodic');
create type public.item_condition as enum ('good', 'fair', 'damaged', 'missing');

-- ---------------------------------------------------------------------------
-- inventory_items — the 12-item template (a lookup table, not an enum, so the
-- RD can adjust the list later without a migration)
-- ---------------------------------------------------------------------------

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null unique
);

comment on table public.inventory_items is
  'The room-inspection checklist template. RD-editable.';

-- Reference data the inspection form depends on — needed in every environment,
-- so it seeds here in the migration (not the dev-only seed.sql). Exactly the
-- 12 items from CLAUDE.md.
insert into public.inventory_items (name, sort_order) values
  ('Air vents', 1),
  ('Bed (frame, mattress, etc.)', 2),
  ('Bookshelves / desk space', 3),
  ('Ceiling', 4),
  ('Floor', 5),
  ('Walls', 6),
  ('Chair', 7),
  ('Table', 8),
  ('Closet', 9),
  ('Door', 10),
  ('Sink', 11),
  ('Windows', 12);

-- ---------------------------------------------------------------------------
-- inspections — one dated snapshot of one room
-- ---------------------------------------------------------------------------

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id),
  resident_id uuid references public.residents (id), -- set for move-in/out
  type public.inspection_type not null,
  timestamp timestamptz not null default now(),
  inspected_by uuid references public.users (id),
  notes text
);

create index inspections_room_time_idx
  on public.inspections (room_id, timestamp desc);

-- ---------------------------------------------------------------------------
-- inspection_items — one row per template item per inspection (the snapshot)
-- ---------------------------------------------------------------------------

create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id),
  condition public.item_condition not null,
  note text,
  unique (inspection_id, inventory_item_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.inventory_items enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_items enable row level security;

-- inventory_items: everyone reads the template; only the RD edits it.
create policy "staff read inventory" on public.inventory_items
  for select to authenticated using (public.is_staff());
create policy "rd creates inventory" on public.inventory_items
  for insert to authenticated with check (public.is_rd());
create policy "rd updates inventory" on public.inventory_items
  for update to authenticated using (public.is_rd()) with check (public.is_rd());
create policy "rd deletes inventory" on public.inventory_items
  for delete to authenticated using (public.is_rd());

-- inspections + items: staff read; IMMUTABLE (no update/delete policy), and
-- writes go only through create_inspection() (SECURITY DEFINER, bypasses RLS).
create policy "staff read inspections" on public.inspections
  for select to authenticated using (public.is_staff());
create policy "staff read inspection items" on public.inspection_items
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Grants (auto-expose is off — see 20260717032303)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.inventory_items to service_role;
-- Inspections are immutable: backend key gets select+insert only, no del/upd.
grant select, insert on public.inspections to service_role;
grant select, insert on public.inspection_items to service_role;

-- authenticated needs table privileges too (auto-expose off gives none). RLS
-- narrows what these actually allow: writes to inventory_items are gated to the
-- RD by policy; inspections have no write policy (RPC-only), so SELECT suffices.
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select on public.inspections to authenticated;
grant select on public.inspection_items to authenticated;

-- ---------------------------------------------------------------------------
-- create_inspection — write a snapshot (header + all items) atomically
-- ---------------------------------------------------------------------------
-- `items` is a jsonb array of { item_id, condition, note }.

create function public.create_inspection(
  target_room uuid,
  target_resident uuid,
  inspection_type public.inspection_type,
  inspection_notes text,
  items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_inspection_id uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may create inspections'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.inspections (room_id, resident_id, type, inspected_by, notes)
  values (target_room, target_resident, inspection_type,
          (select auth.uid()), inspection_notes)
  returning id into new_inspection_id;

  insert into public.inspection_items (inspection_id, inventory_item_id, condition, note)
  select new_inspection_id,
         (elem->>'item_id')::uuid,
         (elem->>'condition')::public.item_condition,
         nullif(elem->>'note', '')
  from jsonb_array_elements(items) as elem;

  return new_inspection_id;
end;
$$;

revoke execute on function
  public.create_inspection(uuid, uuid, public.inspection_type, text, jsonb) from anon;
grant execute on function
  public.create_inspection(uuid, uuid, public.inspection_type, text, jsonb) to authenticated;
