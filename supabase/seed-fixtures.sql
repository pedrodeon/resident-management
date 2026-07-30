-- FAKE fixture roster for the automated test suite. NOT part of the migration
-- sequence and NOT loaded by `db push`.
--
-- ⚠️  Apply this ONLY to a dedicated fixture Supabase project — never to the
-- main project. The suite mutates and deletes these rows. Every name here is
-- obviously invented; no real student data belongs in this repo (CLAUDE.md /
-- FERPA), and the suite's guard (tests/helpers.mjs) refuses to run anywhere
-- "Testy McTestface" is absent, so this file is what makes it runnable at all.
--
--   psql "$FIXTURE_DB_URL" -f supabase/seed-fixtures.sql
--
-- Apply the migrations and supabase/seed.sql to that project FIRST — this
-- expects the 8 hallways, the 84 rooms, and the post-split schema.
--
-- Idempotent: re-running converges rather than duplicating.
--
-- What the suite depends on, made explicit so a future edit doesn't silently
-- break it:
--   * S1000101 "Testy McTestface" — checked_in, present   (the guard row)
--   * S1000102 — checked_in, present
--   * S1000103 — checked_in, AWAY
--   * S1000104 — expected, with ZERO presence events
--   * exactly 3 checked-in stays in Holiday 1 (bulk presence asserts 2/0/3)
--   * at least 20 stays overall, with some outside Holiday 1
--     (rls.test.mjs proves access isn't hallway-scoped)

-- The fixtures live in whatever term the settings row names, so
-- occupancyByStudentId() finds them.
insert into public.app_settings (id, current_term)
values (true, 'Fall 2026')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- People — 24 invented students
-- ---------------------------------------------------------------------------

insert into public.people (full_name, student_id, phone, emergency_contact) values
  ('Testy McTestface',  'S1000101', '555-0101', 'Fixture Contact 555-9101'),
  ('Danvers Fixture',   'S1000102', '555-0102', 'Fixture Contact 555-9102'),
  ('Sample Suzuki',     'S1000103', '555-0103', 'Fixture Contact 555-9103'),
  ('Petit Placeholder', 'S1000104', null,       null),
  ('Mocky Mockington',  'S1000105', '555-0105', 'Fixture Contact 555-9105'),
  ('Stubby Stubbs',     'S1000106', null,       null),
  ('Dummy Dumas',       'S1000107', '555-0107', null),
  ('Faux Faulkner',     'S1000108', null,       'Fixture Contact 555-9108'),
  ('Sample Sanders',    'S1000109', null,       null),
  ('Testly Tanaka',     'S1000110', '555-0110', null),
  ('Placeholder Park',  'S1000111', null,       null),
  ('Fixture Fontaine',  'S1000112', null,       null),
  ('Notreal Nakamura',  'S1000113', '555-0113', null),
  ('Pretend Pereira',   'S1000114', null,       null),
  ('Invented Ivanov',   'S1000115', null,       null),
  ('Madeup Mbeki',      'S1000116', null,       null),
  ('Sample Silva',      'S1000117', null,       null),
  ('Dummy Diallo',      'S1000118', null,       null),
  ('Testy Torres',      'S1000119', null,       null),
  ('Mocked Moreau',     'S1000120', null,       null),
  ('Stub Steiner',      'S1000121', null,       null),
  ('Faux Ferreira',     'S1000122', null,       null),
  ('Sample Sørensen',   'S1000123', null,       null),
  ('Fixture Flores',    'S1000124', null,       null)
on conflict (student_id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      emergency_contact = excluded.emergency_contact;

-- ---------------------------------------------------------------------------
-- Occupancies — one active stay each, in the current term
-- ---------------------------------------------------------------------------
-- Holiday 1 deliberately holds exactly 3 checked-in stays (101, 102, 103) plus
-- one `expected` (104): "mark all away" must change 2 (103 is already away),
-- then 0, then "mark all present" must change 3.

with placement(student_id, hallway, room_number, status, present) as (values
  -- Holiday 1 — the bulk-presence fixture
  ('S1000101', 'Holiday 1',  '101', 'checked_in',  true),
  ('S1000102', 'Holiday 1',  '101', 'checked_in',  true),
  ('S1000103', 'Holiday 1',  '102', 'checked_in',  false), -- away
  ('S1000104', 'Holiday 1',  '103', 'expected',    true),  -- no presence events
  -- Elsewhere in the building: proves access is not hallway-scoped
  ('S1000105', 'Lebanon 1',  '122', 'checked_in',  true),
  ('S1000106', 'Lebanon 1',  '122', 'checked_in',  true),
  ('S1000107', 'Lebanon 1',  '124', 'checked_in',  false),
  ('S1000108', 'Lebanon 1',  '126', 'expected',    true),
  ('S1000109', 'Holiday 2A', '201', 'checked_in',  true),
  ('S1000110', 'Holiday 2A', '201', 'checked_in',  true),
  ('S1000111', 'Holiday 2A', '203', 'checked_in',  true),
  ('S1000112', 'Holiday 2B', '211', 'checked_in',  true),
  ('S1000113', 'Holiday 2B', '211', 'expected',    true),
  ('S1000114', 'Lebanon 2',  '232', 'checked_in',  true),
  ('S1000115', 'Lebanon 2',  '234', 'checked_in',  false),
  ('S1000116', 'Holiday 3A', '301', 'checked_in',  true),
  ('S1000117', 'Holiday 3A', '301', 'checked_in',  true),
  ('S1000118', 'Holiday 3B', '311', 'checked_in',  true),
  ('S1000119', 'Holiday 3B', '311', 'expected',    true),
  ('S1000120', 'Lebanon 3',  '332', 'checked_in',  true),
  ('S1000121', 'Lebanon 3',  '332', 'checked_in',  true),
  ('S1000122', 'Lebanon 3',  '334', 'checked_out', false),
  ('S1000123', 'Holiday 1',  '104', 'checked_out', false),
  ('S1000124', 'Holiday 1',  '104', 'expected',    true)
)
insert into public.occupancies
  (person_id, room_id, term, occupancy_status, is_present, is_archived)
select
  pe.id,
  r.id,
  (select current_term from public.app_settings where id),
  pl.status::public.occupancy_status,
  pl.present,
  false
from placement pl
join public.people pe on pe.student_id = pl.student_id
join public.hallways h on h.name = pl.hallway
join public.rooms r on r.hallway_id = h.id and r.room_number = pl.room_number
-- The partial unique index allows only one active stay per person, so a re-run
-- must not try to insert a second one.
where not exists (
  select 1 from public.occupancies o
  where o.person_id = pe.id
    and o.term = (select current_term from public.app_settings where id)
);

-- Converge presence/status/room on a re-run (a previous suite run may have left
-- them flipped, and the tests assert exact bulk counts).
with placement(student_id, hallway, room_number, status, present) as (values
  ('S1000101', 'Holiday 1',  '101', 'checked_in',  true),
  ('S1000102', 'Holiday 1',  '101', 'checked_in',  true),
  ('S1000103', 'Holiday 1',  '102', 'checked_in',  false),
  ('S1000104', 'Holiday 1',  '103', 'expected',    true),
  ('S1000105', 'Lebanon 1',  '122', 'checked_in',  true),
  ('S1000106', 'Lebanon 1',  '122', 'checked_in',  true),
  ('S1000107', 'Lebanon 1',  '124', 'checked_in',  false),
  ('S1000108', 'Lebanon 1',  '126', 'expected',    true),
  ('S1000109', 'Holiday 2A', '201', 'checked_in',  true),
  ('S1000110', 'Holiday 2A', '201', 'checked_in',  true),
  ('S1000111', 'Holiday 2A', '203', 'checked_in',  true),
  ('S1000112', 'Holiday 2B', '211', 'checked_in',  true),
  ('S1000113', 'Holiday 2B', '211', 'expected',    true),
  ('S1000114', 'Lebanon 2',  '232', 'checked_in',  true),
  ('S1000115', 'Lebanon 2',  '234', 'checked_in',  false),
  ('S1000116', 'Holiday 3A', '301', 'checked_in',  true),
  ('S1000117', 'Holiday 3A', '301', 'checked_in',  true),
  ('S1000118', 'Holiday 3B', '311', 'checked_in',  true),
  ('S1000119', 'Holiday 3B', '311', 'expected',    true),
  ('S1000120', 'Lebanon 3',  '332', 'checked_in',  true),
  ('S1000121', 'Lebanon 3',  '332', 'checked_in',  true),
  ('S1000122', 'Lebanon 3',  '334', 'checked_out', false),
  ('S1000123', 'Holiday 1',  '104', 'checked_out', false),
  ('S1000124', 'Holiday 1',  '104', 'expected',    true)
)
update public.occupancies o
set occupancy_status = pl.status::public.occupancy_status,
    is_present = pl.present,
    room_id = r.id,
    is_archived = false
from placement pl
join public.people pe on pe.student_id = pl.student_id
join public.hallways h on h.name = pl.hallway
join public.rooms r on r.hallway_id = h.id and r.room_number = pl.room_number
where o.person_id = pe.id
  and o.term = (select current_term from public.app_settings where id);

-- ---------------------------------------------------------------------------
-- A returning student — the point of the split
-- ---------------------------------------------------------------------------
-- Testy has a PRIOR archived stay in an earlier term. Everyday screens (and the
-- current_residents view) must ignore it while it stays queryable; rls.test.mjs
-- asserts exactly that.

insert into public.occupancies
  (person_id, room_id, term, occupancy_status, is_present, is_archived)
select pe.id, r.id, 'Fixture Past Term', 'checked_out', false, true
from public.people pe
join public.hallways h on h.name = 'Holiday 1'
join public.rooms r on r.hallway_id = h.id and r.room_number = '105'
where pe.student_id = 'S1000101'
  and not exists (
    select 1 from public.occupancies o
    where o.person_id = pe.id and o.term = 'Fixture Past Term'
  );

-- ---------------------------------------------------------------------------
-- Sanity check — fail loudly rather than let the suite misreport
-- ---------------------------------------------------------------------------

do $$
declare
  n_people int;
  n_active int;
  n_h1_checked_in int;
  n_petit_presence int;
begin
  select count(*) into n_people from public.people;
  select count(*) into n_active
    from public.occupancies
    where is_archived = false
      and term = (select current_term from public.app_settings where id);

  select count(*) into n_h1_checked_in
  from public.occupancies o
  join public.rooms r on r.id = o.room_id
  join public.hallways h on h.id = r.hallway_id
  where h.name = 'Holiday 1'
    and o.occupancy_status = 'checked_in'
    and o.is_archived = false
    and o.term = (select current_term from public.app_settings where id);

  select count(*) into n_petit_presence
  from public.presence_events e
  join public.occupancies o on o.id = e.occupancy_id
  join public.people pe on pe.id = o.person_id
  where pe.student_id = 'S1000104';

  if n_people < 20 then
    raise exception 'only % fixture people; rls.test.mjs needs >= 20', n_people;
  end if;
  if n_active < 20 then
    raise exception 'only % active stays; rls.test.mjs needs >= 20', n_active;
  end if;
  if n_h1_checked_in <> 3 then
    raise exception
      'Holiday 1 has % checked-in stays; presence.test.mjs asserts exactly 3',
      n_h1_checked_in;
  end if;
  if n_petit_presence > 0 then
    raise exception
      'S1000104 has % presence event(s); presence.test.mjs asserts 0. A prior '
      'suite run left events behind — use a fresh fixture project.',
      n_petit_presence;
  end if;

  raise notice 'fixtures ok: % people, % active stays, 3 checked-in in Holiday 1',
    n_people, n_active;
end $$;
