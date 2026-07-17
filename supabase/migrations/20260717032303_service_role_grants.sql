-- With "automatically expose new tables" OFF, service_role gets no automatic
-- table grants either (discovered when scripts/seed-staff.mjs hit 42501).
-- service_role has BYPASSRLS but still needs plain table-level privileges.
-- Every future migration that adds a table must include the same grant.

grant select, insert, update, delete
  on public.users, public.hallways, public.hallway_assignments,
     public.rooms, public.residents
  to service_role;
