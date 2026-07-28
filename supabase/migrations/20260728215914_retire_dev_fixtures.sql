-- Retire the dev fixture data ahead of seeding the real Tudor Hall rooms.
--
-- The fixture roster (20 fake residents, their occupancy/presence/room-change
-- history, every inspection taken on them, and the 12 dev-only rooms) is being
-- removed at the owner's direction so the database can carry the real building
-- structure. Inspections and the event tables are deletable by NO API role —
-- not even service_role (the audit-trail posture) — so this cleanup runs here,
-- as the postgres role, the one legitimate deletion path. Kept untouched:
-- users (staff logins), hallways, and the inventory_items template.
--
-- Idempotent: every statement no-ops once the fixtures are gone.

-- 1. Inspections first (cascades inspection_items and inspection_photos, and
--    unpins the rooms/residents they reference). Every inspection in this
--    database was taken on fixture data; real usage has not begun.
delete from public.inspections;

-- 2. Fixture event history.
delete from public.occupancy_events;
delete from public.presence_events;
delete from public.room_change_events;

-- 3. The 20 fixture residents (all carry S1000xxx student ids).
delete from public.residents where student_id like 'S10%';

-- 4. The 12 dev-only rooms — an explicit list, so nothing else can ever match.
--    (Room numbers that overlap the real building, e.g. Holiday 1 101-103,
--    are NOT here; the seed adopts them.)
delete from public.rooms r
using public.hallways h
where r.hallway_id = h.id
  and (h.name, r.room_number) in (
    ('Lebanon 1',  '121'),
    ('Lebanon 1',  '123'),
    ('Holiday 2A', '202'),
    ('Holiday 2B', '251'),
    ('Holiday 2B', '252'),
    ('Holiday 2B', '253'),
    ('Lebanon 2',  '222'),
    ('Holiday 3A', '302'),
    ('Holiday 3B', '351'),
    ('Holiday 3B', '352'),
    ('Holiday 3B', '353'),
    ('Lebanon 3',  '322')
  );
