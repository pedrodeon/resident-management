-- Seed data — ALL FAKE. Real resident records must never enter dev
-- (CLAUDE.md: FERPA-sensitive; wait for Residence Life / IT sign-off).
--
-- Applies to a fresh schema. Contents: the 8 real hallways, 24 fake rooms
-- (3 per hallway), 20 fake residents with a status mix so every screen state
-- is developable. Staff accounts are NOT here — they need auth.users rows,
-- so run `npm run seed:staff` after this.
--
-- Idempotent-ish: `on conflict do nothing` for hallways/rooms; residents are
-- keyed by unique student_id, same treatment.

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
-- Fake rooms — 3 per hallway, numbered <floor><A=0x/B=5x>, capacity mostly 2
-- ---------------------------------------------------------------------------

insert into public.rooms (hallway_id, room_number, capacity)
select h.id, r.room_number, r.capacity
from (values
  ('Holiday 1',  '101', 2), ('Holiday 1',  '102', 2), ('Holiday 1',  '103', 1),
  ('Lebanon 1',  '121', 2), ('Lebanon 1',  '122', 2), ('Lebanon 1',  '123', 3),
  ('Holiday 2A', '201', 2), ('Holiday 2A', '202', 2), ('Holiday 2A', '203', 2),
  ('Holiday 2B', '251', 2), ('Holiday 2B', '252', 2), ('Holiday 2B', '253', 1),
  ('Lebanon 2',  '221', 2), ('Lebanon 2',  '222', 2), ('Lebanon 2',  '223', 2),
  ('Holiday 3A', '301', 2), ('Holiday 3A', '302', 2), ('Holiday 3A', '303', 2),
  ('Holiday 3B', '351', 2), ('Holiday 3B', '352', 2), ('Holiday 3B', '353', 1),
  ('Lebanon 3',  '321', 2), ('Lebanon 3',  '322', 2), ('Lebanon 3',  '323', 3)
) as r (hallway_name, room_number, capacity)
join public.hallways h on h.name = r.hallway_name
on conflict (hallway_id, room_number) do nothing;

-- ---------------------------------------------------------------------------
-- 20 fake residents
-- ---------------------------------------------------------------------------
-- Status mix: 13 checked_in (2 of them away → previews the orange accent),
-- 6 expected (move-in no-show view), 1 checked_out. Obviously-fake names,
-- student IDs S1000101+, 555 phone numbers.

insert into public.residents
  (full_name, student_id, room_id, phone, emergency_contact,
   occupancy_status, is_present)
select r.full_name, r.student_id, rm.id, r.phone, r.emergency_contact,
       r.occupancy_status::public.occupancy_status, r.is_present
from (values
  -- Holiday 1
  ('Testy McTestface',  'S1000101', 'Holiday 1',  '101', '555-0101', 'Parenta McTestface 555-0201', 'checked_in',  true),
  ('Demo Danvers',      'S1000102', 'Holiday 1',  '101', '555-0102', 'Guardian Danvers 555-0202',   'checked_in',  true),
  ('Sample Suzuki',     'S1000103', 'Holiday 1',  '102', '555-0103', 'Family Suzuki 555-0203',      'checked_in',  false),
  ('Placeholder Petit', 'S1000104', 'Holiday 1',  '103', null,       null,                          'expected',    true),
  -- Lebanon 1
  ('Fixture Flores',    'S1000105', 'Lebanon 1',  '121', '555-0105', 'Madre Flores 555-0205',       'checked_in',  true),
  ('Mock Mbeki',        'S1000106', 'Lebanon 1',  '121', '555-0106', 'Papa Mbeki 555-0206',         'checked_in',  true),
  ('Dummy Dubois',      'S1000107', 'Lebanon 1',  '122', '555-0107', 'Oncle Dubois 555-0207',       'expected',    true),
  ('Faker Fernandez',   'S1000108', 'Lebanon 1',  '123', '555-0108', 'Tia Fernandez 555-0208',      'checked_in',  true),
  -- Holiday 2A
  ('Stub Stefansson',   'S1000109', 'Holiday 2A', '201', '555-0109', 'Afi Stefansson 555-0209',     'checked_in',  true),
  ('Specimen Park',     'S1000110', 'Holiday 2A', '201', '555-0110', 'Eomma Park 555-0210',         'checked_in',  false),
  ('Example Eze',       'S1000111', 'Holiday 2A', '202', null,       null,                          'expected',    true),
  -- Holiday 2B
  ('Pretend Popov',     'S1000112', 'Holiday 2B', '251', '555-0112', 'Babushka Popov 555-0212',     'checked_in',  true),
  ('Imaginary Ito',     'S1000113', 'Holiday 2B', '252', '555-0113', 'Haha Ito 555-0213',           'checked_in',  true),
  -- Lebanon 2
  ('Notreal Novak',     'S1000114', 'Lebanon 2',  '221', '555-0114', 'Teta Novak 555-0214',         'checked_in',  true),
  ('Bogus Baptiste',    'S1000115', 'Lebanon 2',  '222', '555-0115', 'Frere Baptiste 555-0215',     'expected',    true),
  -- Holiday 3A
  ('Synthetic Singh',   'S1000116', 'Holiday 3A', '301', '555-0116', 'Chacha Singh 555-0216',       'checked_in',  true),
  ('Ersatz Eriksen',    'S1000117', 'Holiday 3A', '302', null,       null,                          'expected',    true),
  -- Holiday 3B
  ('Simulated Silva',   'S1000118', 'Holiday 3B', '351', '555-0118', 'Avo Silva 555-0218',          'checked_in',  true),
  -- Lebanon 3
  ('Invented Ivanova',  'S1000119', 'Lebanon 3',  '321', '555-0119', 'Dyadya Ivanova 555-0219',     'checked_out', true),
  ('Madeup Marchetti',  'S1000120', 'Lebanon 3',  '322', null,       null,                          'expected',    true)
) as r (full_name, student_id, hallway_name, room_number, phone,
        emergency_contact, occupancy_status, is_present)
join public.hallways h on h.name = r.hallway_name
join public.rooms rm on rm.hallway_id = h.id and rm.room_number = r.room_number
on conflict (student_id) do nothing;
