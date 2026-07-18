// Hand-written row types mirroring supabase/migrations/*_staff_and_building.sql.
// Once the cloud project exists, these can be replaced by generated types
// (`npx supabase gen types typescript`) — keep all DB row shapes in this file
// so that swap stays a one-file change.

export type StaffRole = "rd" | "ra";
export type Wing = "holiday" | "lebanon";
export type OccupancyStatus = "expected" | "checked_in" | "checked_out";
export type OccupancyEventType = "check_in" | "check_out";
export type PresenceStatus = "away" | "returned";

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
};

export type Hallway = {
  id: string;
  name: string;
  wing: Wing;
  floor: number;
  section: string | null;
  sort_order: number;
};

export type Room = {
  id: string;
  hallway_id: string;
  room_number: string;
  capacity: number;
};

export type Resident = {
  id: string;
  full_name: string;
  student_id: string;
  room_id: string;
  phone: string | null;
  emergency_contact: string | null;
  occupancy_status: OccupancyStatus;
  is_present: boolean;
};

export type PresenceEvent = {
  id: string;
  resident_id: string;
  status: PresenceStatus;
  timestamp: string;
  recorded_by: string | null;
  note: string | null;
};

export type OccupancyEvent = {
  id: string;
  resident_id: string;
  type: OccupancyEventType;
  timestamp: string;
  recorded_by: string | null;
  note: string | null;
};
