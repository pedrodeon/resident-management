-- Photo attachments on inspection items (first v2 feature).
--
-- A photo of a wall at move-in ends arguments at move-out — but only if it is
-- as tamper-proof as the snapshot it belongs to. So photos inherit the
-- inspection posture end to end: the storage bucket allows INSERT and SELECT
-- for staff and nothing else (no overwrite, no delete, not even by the
-- uploader), and inspection_photos rows are written only through
-- create_inspection(), atomically with the snapshot.

-- ---------------------------------------------------------------------------
-- Private storage bucket
-- ---------------------------------------------------------------------------
-- Room photos of student housing are sensitive: the bucket is private and the
-- app serves them only via short-lived signed URLs minted under the caller's
-- RLS. 5 MB cap; the client downscales to ~1600px JPEG before upload anyway.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-photos',
  'inspection-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage RLS (policies live on storage.objects). INSERT + SELECT for staff,
-- scoped to this bucket; deliberately NO update/delete policies — uploaded
-- photos are immutable, matching inspections.
create policy "staff upload inspection photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inspection-photos' and public.is_staff());

create policy "staff read inspection photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'inspection-photos' and public.is_staff());

-- ---------------------------------------------------------------------------
-- inspection_photos — which photo belongs to which snapshot item
-- ---------------------------------------------------------------------------

create table public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  inspection_item_id uuid not null references public.inspection_items (id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.inspection_photos is
  'Photos attached to inspection items. Immutable; written only via create_inspection().';

create index inspection_photos_inspection_idx
  on public.inspection_photos (inspection_id);

alter table public.inspection_photos enable row level security;

-- Staff read; no write policy — rows are inserted by the SECURITY DEFINER RPC.
create policy "staff read inspection photos rows" on public.inspection_photos
  for select to authenticated using (public.is_staff());

-- Auto-expose is off (see 20260717032303): grant explicitly. No delete even
-- for service_role — same audit posture as the event tables.
grant select on public.inspection_photos to authenticated;
grant select, insert on public.inspection_photos to service_role;

-- ---------------------------------------------------------------------------
-- create_inspection — accept optional per-item photo paths
-- ---------------------------------------------------------------------------
-- Each `items` element may now carry "photos": ["<storage_path>", ...].
-- Backward compatible: callers that omit it behave exactly as before.

create or replace function public.create_inspection(
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

  -- Items and their photos in one pass, so the whole snapshot (rows AND photo
  -- links) commits or nothing does.
  with inserted_items as (
    insert into public.inspection_items (inspection_id, inventory_item_id, condition, note)
    select new_inspection_id,
           (elem->>'item_id')::uuid,
           (elem->>'condition')::public.item_condition,
           nullif(elem->>'note', '')
    from jsonb_array_elements(items) as elem
    returning id, inventory_item_id
  )
  insert into public.inspection_photos (inspection_id, inspection_item_id, storage_path)
  select new_inspection_id, ii.id, photo.value
  from jsonb_array_elements(items) as elem
  join inserted_items ii
    on ii.inventory_item_id = (elem->>'item_id')::uuid
  cross join lateral jsonb_array_elements_text(coalesce(elem->'photos', '[]'::jsonb)) as photo;

  return new_inspection_id;
end;
$$;
