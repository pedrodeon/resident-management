# CLAUDE.md — Tudor Hall Management App

This file gives you (Claude Code) the context for this project. Read it at the
start of every session. When something here is ambiguous or seems wrong, ask
before making large changes.

## What we're building

A web app to replace paper-based resident management in **Tudor Hall**, a
university dorm of ~200 residents, managed by one Resident Director (RD) and
**7 Resident Assistants (RAs)**. This is v1 — keep it small, shippable, and easy
to maintain by a solo developer (a senior CS student).

The app does four things:

1. **Occupancy (rare, bursty):** a resident checks in ONCE when they arrive at
   the start of the semester and checks out ONCE when they leave at the end.
   Move-in day means ~200 check-ins over a single weekend, so this flow must be
   fast and must surface who has not arrived yet.
2. **Presence (the everyday interaction):** during long breaks (Thanksgiving,
   spring break, etc.) staff flip a simple live toggle next to each resident's
   name when they leave and when they return. No full check-out procedure. The
   toggle is intentionally generic — not tied to named "break" records — so it
   works for any break or long weekend with zero configuration.
3. **Navigation by hallway:** browse the building structure down to a room and
   see who lives there.
4. **Room inspections:** dated condition snapshots of each room for damage control.

## Building structure

Tudor Hall has **8 hallways** across two wings (Holiday, Lebanon) over 3 floors.
Holiday's 2nd and 3rd floors are split into A/B sections:

| Hallway     | Wing    | Floor | Section |
|-------------|---------|-------|---------|
| Holiday 1   | Holiday | 1     | —       |
| Lebanon 1   | Lebanon | 1     | —       |
| Holiday 2A  | Holiday | 2     | A       |
| Holiday 2B  | Holiday | 2     | B       |
| Lebanon 2   | Lebanon | 2     | —       |
| Holiday 3A  | Holiday | 3     | A       |
| Holiday 3B  | Holiday | 3     | B       |
| Lebanon 3   | Lebanon | 3     | —       |

**Hallway — not floor — is the organizing unit.** Rooms belong to a hallway; the
hallway knows its wing and floor.

There are 8 hallways and 7 RAs, so coverage is NOT one-to-one — an RA may cover
two hallways, or the RD may cover one. Coverage is recorded as metadata only
(see `hallway_assignments`); it does NOT restrict access. All staff can see and
act on all hallways.

**Navigation hierarchy:** TUDOR HALL → hallway → rooms → room detail (residents).

## Tech stack

- **Framework:** Next.js (React), App Router, TypeScript.
- **Database + auth:** Supabase (Postgres). Use Supabase Auth and the Supabase
  JS client. Enforce access with Postgres Row-Level Security (RLS).
- **Styling:** simple and clean; used at a desk and on phones, so mobile-friendly
  layouts matter. Don't pull in a heavy component library unless it clearly earns
  its place.
- Prefer server components / server actions for data access where sensible;
  keep the Supabase service key server-side only.

## Visual design

School colors: **navy blue, light orange, black, white.** The app should read as
predominantly navy.

- **Navy:** dominant chrome — top nav, headers, primary buttons, key surfaces.
- **White:** content areas and list backgrounds.
- **Black:** body text.
- **Light orange:** ACCENT ONLY, used sparingly to draw the eye to status that
  needs attention — `away` residents during a break, `expected` (not yet arrived)
  residents on move-in day, and `damaged`/`missing` inspection items. If
  everything is orange, nothing is.
- Accessibility: light orange fails contrast against white for text. Use it as a
  background chip, badge, or left-border with dark text on top — never as text
  color on a white background. Verify contrast on interactive elements.

## Critical constraint: sensitive student data

This app stores real students' names, student ID numbers, room assignments,
contact info, and occupancy/presence logs. That data is sensitive and likely
covered by FERPA and/or the university's data policies.

- **Develop and test against seed / fake data only.** Do not load real resident
  records until Residence Life and IT have signed off on where the data lives.
- Never commit secrets. Keep keys in `.env.local`; ensure `.env*` is gitignored.
- Never put resident data in URLs, query strings, or logs.

**Setup prerequisite — use a dedicated Supabase organization.** This project must
live in its own Supabase organization, separate from any other projects (e.g.
garagehero). On the Free/Pro plans, every member of an organization can see every
project in it, so an isolated org keeps this work private and this sensitive data
walled off. Create the new org first, then the project inside it.

Supabase project security settings: Data API **on**, "automatically expose new
tables" **off**, automatic RLS **on**.

## Who logs in

Only **staff** log in: the RD and the 7 RAs. **Residents never log in** — they are
records, not user accounts. There is no student-facing login.

## Data model

### users (staff only)
- `id` (uuid, pk)
- `name` (text)
- `email` (text, unique) — used for Supabase Auth invite
- `role` (enum: `rd` | `ra`)

### hallway_assignments (metadata: which RA covers which hallway)
- `id` (uuid, pk)
- `user_id` (uuid, fk → users)
- `hallway_id` (uuid, fk → hallways)
- unique(user_id, hallway_id)

**Metadata only — NOT access control.** Used to display "RA: Jane Doe" on a
hallway so staff and the RD know who is responsible for it. Every staff member
can access every hallway regardless of assignment. This table is optional; the
app works without it if you'd rather cut it.

### hallways
- `id` (uuid, pk)
- `name` (text) — e.g. "Holiday 2A"
- `wing` (enum: `holiday` | `lebanon`)
- `floor` (int: 1 | 2 | 3)
- `section` (text, nullable) — "A" | "B" | null
- `sort_order` (int) — for stable display order

Seed with the 8 hallways in the table above.

### rooms
- `id` (uuid, pk)
- `hallway_id` (uuid, fk → hallways)
- `room_number` (text)
- `capacity` (int)

### residents (records, not accounts)
- `id` (uuid, pk)
- `full_name` (text)
- `student_id` (text) — displayed on the room detail screen
- `room_id` (uuid, fk → rooms)
- `phone` (text, nullable)
- `emergency_contact` (text, nullable)
- `occupancy_status` (enum: `expected` | `checked_in` | `checked_out`) — cache;
  source of truth is the latest `occupancy_events` row. Everyone starts as
  `expected` when added to the roster before move-in.
- `is_present` (boolean, default true) — THE LIVE TOGGLE. Source of truth for
  "are they in the building right now." Only meaningful while `checked_in`.

### occupancy_events (semester move-in / move-out log)
- `id` (uuid, pk)
- `resident_id` (uuid, fk → residents)
- `type` (enum: `check_in` | `check_out`)
- `timestamp` (timestamptz, default now())
- `recorded_by` (uuid, fk → users)
- `note` (text, nullable)

~2 rows per resident per semester. Append-only.

### presence_events (break toggle history)
- `id` (uuid, pk)
- `resident_id` (uuid, fk → residents)
- `status` (enum: `away` | `returned`)
- `timestamp` (timestamptz, default now())
- `recorded_by` (uuid, fk → users)
- `note` (text, nullable) — e.g. expected return date

Written every time the toggle flips, so we can answer "who stayed over
Thanksgiving?" after the fact. Append-only.

### room_change_events (RD-only room reassignments)
- `id` (uuid, pk)
- `resident_id` (uuid, fk → residents)
- `from_room_id` (uuid, fk → rooms, nullable)
- `to_room_id` (uuid, fk → rooms)
- `timestamp` (timestamptz, default now())
- `changed_by` (uuid, fk → users)
- `reason` (text, nullable)

Matters for damage attribution: it establishes which room a resident occupied
during which window.

### inventory_items (the 12-item template — seeded lookup table)
- `id` (uuid, pk)
- `name` (text)
- `sort_order` (int)

Seed exactly these 12: Air vents; Bed (frame, mattress, etc.); Bookshelves /
desk space; Ceiling; Floor; Walls; Chair; Table; Closet; Door; Sink; Windows.

A lookup table (not an enum) so the RD can adjust the list later without a
migration.

### inspections (a dated condition SNAPSHOT of one room)
- `id` (uuid, pk)
- `room_id` (uuid, fk → rooms)
- `resident_id` (uuid, fk → residents, nullable) — set for move-in/move-out
  inspections tied to a specific resident
- `type` (enum: `move_in` | `move_out` | `periodic`)
- `timestamp` (timestamptz, default now())
- `inspected_by` (uuid, fk → users)
- `notes` (text, nullable)

### inspection_items (one row per template item per inspection)
- `id` (uuid, pk)
- `inspection_id` (uuid, fk → inspections)
- `inventory_item_id` (uuid, fk → inventory_items)
- `condition` (enum: `good` | `fair` | `damaged` | `missing`)
- `note` (text, nullable)

### Why inspections are snapshots, not one editable sheet per room

Damage control only works if you can compare a room's condition at move-in
against its condition at move-out. A single mutable checklist destroys the
"before" state the moment it's edited, leaving no basis to assign
responsibility. So: the 12 items are a template, and each inspection is an
immutable dated snapshot. **Damage is the diff between two snapshots**, attributed
to whoever occupied the room in between (via occupancy_events and
room_change_events).

Creating a `move_in` inspection should be part of the check-in flow, and a
`move_out` inspection part of the check-out flow.

### Relationships
- A hallway has many rooms. A room has many residents.
- A resident has many occupancy_events, presence_events, and room_change_events.
- A room has many inspections; an inspection has one row per inventory_item.
- Every event and inspection records the staff member who performed it.

## Roles & permissions (drives the RLS rules)

Deliberately simple. There is **no hallway scoping of access.** Every staff
member can see and act on every hallway, room, and resident in Tudor Hall. Role
gates writes to the roster, nothing else.

**Any authenticated staff (rd or ra) can:**
- Read all hallways, rooms, and residents.
- Search any resident by name or student ID.
- Record occupancy_events (check-in / check-out) for any resident.
- Flip `is_present` and record presence_events for any resident.
- Create and view inspections for any room.

**RD only:**
- Create/update/delete residents; assign and change rooms (room_change_events).
- Create/update/delete rooms and hallways.
- Invite/remove staff users and set hallway_assignments.
- Edit the inventory item template.

**Everyone:** the three event tables (occupancy_events, presence_events,
room_change_events) and inspections/inspection_items are **insert-only** — never
edited or deleted — which keeps a clean audit trail.

Implement as Postgres RLS policies keyed off the logged-in user's `role`. Do not
rely on client-side checks alone. These policies should be short: authenticated
staff can SELECT everything; only `rd` can INSERT/UPDATE/DELETE on the roster
tables.

Possible v2 tightening (do not build now): restrict full detail (phone,
emergency_contact) to the RD and the resident's own RA, exposing only name,
room, and occupancy_status building-wide. Implement via a restricted view or
column-level policies. Not worth the complexity in v1.

## Screens (v1)

1. **Login** — staff email/password via Supabase Auth.

2. **Dashboard — titled "TUDOR HALL".** Under the title, a list of **all 8
   hallways**, grouped by wing and floor in `sort_order`. Same view for every
   staff member — RD and RAs alike. Show at-a-glance counts per hallway (checked
   in / expected / away) and, if `hallway_assignments` is in use, the name of the
   RA who covers each one.

3. **Hallway view** — all rooms in that hallway. Also hosts the hallway roster
   with the **live present/away toggle inline next to each resident's name**.
   Flipping it updates `is_present` and writes a presence_event. Away rows are
   highlighted in the orange accent. Include **bulk actions: "mark all present"
   and "mark all away"** — nobody is flipping 150 toggles by hand after spring
   break. This list is safety-relevant (who is in the building during a break),
   so make it fast, obvious, and printable.

4. **Room detail** — the residents living in that room with their **student ID
   numbers**, room capacity, and a link to the room's inspection history.
   Room reassignment controls appear here for the RD only.

5. **Inspection sheet** — create a new inspection for a room: all 12 template
   items, each with a condition (good/fair/damaged/missing) and a note. View past
   inspections read-only. Support a side-by-side compare of two inspections
   (typically move-in vs. move-out) with differences highlighted.

6. **Move-in / move-out** — the semester occupancy flow, reachable from the desk.
   Search ANY resident building-wide by name or student ID, see status, record
   check-in or check-out, and create the paired move_in/move_out inspection.
   Optimized for move-in day throughput and prominently shows **who is still
   `expected`** so the RD can chase no-shows.

7. **Resident detail** — full record (room, student ID, contacts), plus occupancy
   history, presence history, and room-change history.

8. **Admin (RD only)** — add/edit residents, manage rooms, invite/remove RAs,
   assign RAs to hallways, edit the inventory item template.

## Suggested build order

Build in this order; each step should be usable before starting the next:

1. Scaffold Next.js + Supabase; auth + login; navy/orange design tokens.
2. Schema + RLS for users, hallways, hallway_assignments, rooms, residents.
   Seed the 8 hallways, fake rooms, ~20 fake residents, RD + 2 RAs.
3. TUDOR HALL dashboard → hallway view → room detail navigation.
4. Presence toggle + bulk actions on the hallway view (the everyday feature).
5. Move-in/move-out flow + occupancy_events + the `expected` no-show view.
6. Inspections: template, create sheet, history, compare.
7. Admin screens + room reassignment.

## Explicitly out of scope for v1

Do not build these yet: photo attachments on inspections (STRONGLY recommended
as the first v2 addition — a photo of a wall at move-in ends arguments at
move-out), incident reports, maintenance tickets, package logging, duty/shift
scheduling, roommate agreements, named/configurable break periods with date
ranges, damage cost calculation or billing, student self-service, and
notifications.

## Working conventions

- Before any non-trivial change, create a git branch.
- Seed realistic fake data so screens can be developed and demoed without real data.
- Write RLS policies alongside any new table or column that touches resident data.
- Keep functions and components small; favor readability over cleverness.
- Ask before adding new dependencies or changing the data model.
