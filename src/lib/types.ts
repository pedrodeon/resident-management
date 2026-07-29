// Hand-written row types mirroring supabase/migrations/*_staff_and_building.sql.
// Once the cloud project exists, these can be replaced by generated types
// (`npx supabase gen types typescript`) — keep all DB row shapes in this file
// so that swap stays a one-file change.

export type StaffRole = "rd" | "ra";
export type Wing = "holiday" | "lebanon";
export type OccupancyStatus = "expected" | "checked_in" | "checked_out";
export type OccupancyEventType = "check_in" | "check_out";
export type PresenceStatus = "away" | "returned";
export type InspectionType = "move_in" | "move_out" | "periodic";
export type ItemCondition = "good" | "fair" | "damaged" | "missing";

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

export type RoomChangeEvent = {
  id: string;
  resident_id: string;
  from_room_id: string | null;
  to_room_id: string;
  timestamp: string;
  changed_by: string | null;
  reason: string | null;
};

export type InventoryItem = {
  id: string;
  name: string;
  sort_order: number;
};

export type Inspection = {
  id: string;
  room_id: string;
  resident_id: string | null;
  type: InspectionType;
  timestamp: string;
  inspected_by: string | null;
  notes: string | null;
};

export type InspectionItem = {
  id: string;
  inspection_id: string;
  inventory_item_id: string;
  condition: ItemCondition;
  note: string | null;
};

/** Room-check rating: 1 = poor … 5 = excellent. */
export type Rating = 1 | 2 | 3 | 4 | 5;

export type RoomCheck = {
  id: string;
  room_id: string;
  checked_by: string;
  timestamp: string;
  floor_cleanliness: Rating;
  trash: Rating;
  laundry: Rating;
  overall: Rating;
  notes: string | null;
  prohibited_items: string | null;
};

export type InspectionPhoto = {
  id: string;
  inspection_id: string;
  inspection_item_id: string;
  storage_path: string;
  created_at: string;
};
