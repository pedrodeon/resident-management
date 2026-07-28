-- Tudor Hall building structure — REAL data (hallways + rooms).
--
-- The dev fixture roster (fake residents/events/inspections) was retired in
-- migration 20260728215914; the seed now carries only the real building.
-- Residents are added through the app (RD admin) — never seeded, and real
-- resident records stay out of this repo entirely (CLAUDE.md/FERPA).
--
-- Idempotent: hallways no-op on conflict; rooms converge (re-running updates
-- capacity rather than duplicating). Note: the CLI only re-runs this file
-- when its hash changes — after editing it, apply with
-- `npx supabase db push --include-seed`.

-- ---------------------------------------------------------------------------
-- The 8 hallways (exactly the CLAUDE.md table)
-- ---------------------------------------------------------------------------

insert into public.hallways (name, wing, floor, section, sort_order) values
  ('Holiday 1',  'holiday', 1, null, 1),
  ('Lebanon 1',  'lebanon', 1, null, 2),
  ('Holiday 2A', 'holiday', 2, 'A',  3),
  ('Holiday 2B', 'holiday', 2, 'B',  4),
  ('Lebanon 2',  'lebanon', 2, null, 5),
  ('Holiday 3A', 'holiday', 3, 'A',  6),
  ('Holiday 3B', 'holiday', 3, 'B',  7),
  ('Lebanon 3',  'lebanon', 3, null, 8)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- The 84 real rooms — all capacity 2 (none noted otherwise)
-- ---------------------------------------------------------------------------
-- Counts per hallway: H1=9, L1=9, H2A=11, H2B=12, L2=10, H3A=11, H3B=12,
-- L3=10 — total 84.

insert into public.rooms (hallway_id, room_number, capacity)
select h.id, room_number, 2
from (values
  ('Holiday 1',  array['101','102','103','104','105','106','107','108','110']),
  ('Lebanon 1',  array['122','124','126','128','130','131','132','133','134']),
  ('Holiday 2A', array['201','203','204','205','206','207','208','209','210','212','214']),
  ('Holiday 2B', array['211','213','215','216','217','218','220','222','224','226','228','230']),
  ('Lebanon 2',  array['219','221','223','232','234','236','238','240','242','244']),
  ('Holiday 3A', array['301','303','304','305','306','307','308','309','310','312','314']),
  ('Holiday 3B', array['311','313','315','316','317','318','320','322','324','326','328','330']),
  ('Lebanon 3',  array['319','321','323','332','334','336','338','340','342','344'])
) as r (hallway_name, room_numbers)
join public.hallways h on h.name = r.hallway_name
cross join lateral unnest(r.room_numbers) as room_number
on conflict (hallway_id, room_number) do update
  set capacity = excluded.capacity;
