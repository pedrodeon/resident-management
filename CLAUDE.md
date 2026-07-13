# CLAUDE.md — Dorm Management App

This file gives you (Claude Code) the context for this project. Read it at the
start of every session. When something here is ambiguous or seems wrong, ask
before making large changes.

## What we're building

A web app to replace paper-based resident check-in/check-out in a university
dorm of ~200 residents, managed by one Resident Director (RD) and 5 Resident
Assistants (RAs). This is v1 — keep it small, shippable, and easy to maintain
by a solo developer (a senior CS student).

The single most important flow is **digital check-in / check-out** at the front
desk, replacing a paper logbook.

## Tech stack

- **Framework:** Next.js (React), App Router, TypeScript.
- **Database + auth:** Supabase (Postgres). Use Supabase Auth and the Supabase
  JS client. Enforce access with Postgres Row-Level Security (RLS).
- **Styling:** keep it simple and clean; the UI is used at a desk and on phones,
  so mobile-friendly layouts matter. Don't pull in a heavy component library
  unless it clearly earns its place.
- Prefer server components / server actions for data access where sensible;
  keep the Supabase service key server-side only.

## Critical constraint: sensitive student data

This app stores real students' names, room assignments, contact info, and
movement logs. That data is sensitive and likely covered by FERPA and/or the
university's data policies.

- **Develop and test against seed / fake data only.** Do not load real resident
  records until Residence Life and IT have signed off on where the data lives.
- Never commit secrets. Keep keys in `.env.local`; ensure `.env*` is gitignored.
- Never put resident data in URLs, query strings, or logs.

## Who logs in

Only **staff** log in: the RD and the 5 RAs. **Residents never log in** — they
are records, not user accounts. There is no student-facing login.

## Data model

Four tables.

### users (staff only)
- `id` (uuid, pk)
- `name` (text)
- `email` (text, unique) — used for Supabase Auth invite
- `role` (enum: `rd` | `ra`)
- `assigned_floors` (int[] or text[], optional) — metadata only in v1, NOT used
  for access control. Useful later for duty schedules / coverage reports.

### rooms
- `id` (uuid, pk)
- `building` (text)
- `floor` (int)
- `room_number` (text)
- `capacity` (int)

### residents (records, not accounts)
- `id` (uuid, pk)
- `full_name` (text)
- `student_id` (text)
- `room_id` (uuid, fk → rooms)
- `phone` (text, nullable)
- `emergency_contact` (text, nullable)
- `current_status` (enum: `in` | `out`) — optional cache for fast reads; the
  real source of truth is the latest `check_events` row for the resident.

### check_events (the log that replaces paper)
- `id` (uuid, pk)
- `resident_id` (uuid, fk → residents)
- `type` (enum: `check_in` | `check_out`)
- `timestamp` (timestamptz, default now())
- `recorded_by` (uuid, fk → users) — which staff member performed it
- `note` (text, nullable) — e.g. expected return time

### Relationships
- A room has many residents.
- A resident has many check_events.
- A check_event is recorded by one user (staff member).

## Roles & permissions (drives the RLS rules)

Any on-duty staff member handles any resident — access is NOT sliced by floor.

- **Any authenticated staff (rd or ra):** read all residents and rooms;
  read and write (insert) check_events for any resident.
- **RD only:** manage the roster — create/update/delete residents, assign
  rooms, and invite/remove staff users.
- check_events are append-only in v1 (records are inserted, not edited or
  deleted), which keeps a clean audit trail.

Implement these as Postgres RLS policies on each table, keyed off the logged-in
user's `role`. Do not rely on client-side checks alone.

## Screens (v1)

1. **Login** — staff email/password via Supabase Auth.
2. **Dashboard ("who's out")** — home screen. Everyone currently checked out
   plus their return notes, and an in/out count. Derived from the latest
   check_event per resident.
3. **Check-in / check-out** — the core desk flow. Search a resident by name or
   student ID, see current status, tap check-in or check-out, add an optional
   note. Writes a check_event.
4. **Resident detail** — full record (room, contacts) plus that resident's
   check history.
5. **Roster (RD only)** — add/edit residents, assign rooms, invite/remove RAs.

## Explicitly out of scope for v1

Do not build these yet — they are future work, not part of the first release:
incident reports, maintenance tickets, package logging, duty/shift scheduling,
roommate agreements, student self-service, and notifications.

## Working conventions

- Before any non-trivial change, create a git branch.
- Seed the database with realistic fake data (rooms, ~20 sample residents, the
  RD + a couple of RAs) so screens can be developed and demoed without real data.
- Write RLS policies alongside any new table or column that touches resident data.
- Keep functions and components small; favor readability over cleverness.
- Ask before adding new dependencies or changing the data model.
