import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadInspectionRecord,
  recordComplete,
  sortedItems,
  type InspectionRecord,
} from "@/lib/inspection-record";
import { PHOTO_BUCKET } from "@/lib/photos";
import { staffName } from "@/lib/staff-name";
import type {
  InspectionPdfData,
  PdfPhoto,
  PdfSignature,
} from "@/lib/inspection-pdf";
import { byRoomNumber } from "@/lib/packet-format";

/*
 * Turning stored records into printable ones.
 *
 * `toPdfData` is what the single-resident export has always done, lifted out
 * of its route so the hallway packet feeds the renderer through exactly the
 * same function. One loader, one mapper, one template: a packet page and a
 * single-resident page are produced by identical code, which is the only way
 * "identical to the individual export" stays true as this changes.
 *
 * Everything here reads through the CALLER'S client — rows under their RLS,
 * blobs under their storage policies. There is no service-role path: a
 * packet can only ever contain records its requester could already open one
 * at a time.
 */

/** One stored record, resolved into the renderer's input (images included). */
export async function toPdfData(
  supabase: SupabaseClient,
  inspection: InspectionRecord & {
    rooms: NonNullable<InspectionRecord["rooms"]>;
    occupancies: NonNullable<InspectionRecord["occupancies"]>;
  },
): Promise<InspectionPdfData> {
  const download = async (path: string): Promise<Buffer | null> => {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).download(path);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };

  const resident = inspection.occupancies.people;
  const items = sortedItems(inspection);
  const roles = new Set(inspection.inspection_signatures.map((s) => s.role));
  const waiver = inspection.inspection_signature_waivers;

  const signatures: PdfSignature[] = await Promise.all(
    inspection.inspection_signatures.map(async (s) => ({
      role: s.role,
      signedAt: s.signed_at,
      signerName:
        s.role === "resident"
          ? (resident?.full_name ?? "Resident")
          : staffName(s.captured),
      png: await download(s.storage_path),
    })),
  );

  const photos: PdfPhoto[] = await Promise.all(
    items.flatMap((item) =>
      item.inspection_photos.map(async (p) => ({
        itemName: item.inventory_items?.name ?? "Item",
        jpeg: await download(p.storage_path),
      })),
    ),
  );

  return {
    // `periodic` never reaches here: both routes refuse it before calling.
    type: inspection.type as "move_in" | "move_out",
    residentName: resident?.full_name ?? "—",
    studentId: resident?.student_id ?? "—",
    roomNumber: inspection.rooms.room_number,
    hallwayName: inspection.rooms.hallways?.name ?? "—",
    term: inspection.occupancies.term,
    inspectedAt: inspection.timestamp,
    inspectorName: staffName(inspection.users),
    items: items.map((i) => ({
      name: i.inventory_items?.name ?? "Item",
      condition: i.condition,
      note: i.note,
    })),
    inspectionNote: inspection.notes,
    photos,
    signatures,
    waiver:
      !roles.has("resident") && waiver
        ? {
            reason: waiver.reason,
            recordedBy: staffName(waiver.users),
            recordedAt: waiver.created_at,
          }
        : null,
  };
}

export type HallwayCheckins = {
  hallwayName: string;
  /** Ordered by room number; every one has a complete, signed move-in. */
  inspectionIds: string[];
};

/**
 * Which move-in records belong in a hallway's packet.
 *
 * A resident is included when BOTH are true: their stay has moved past
 * `expected` (so the check-in was actually finalised) and their move-in
 * inspection is fully signed. The two go together by design —
 * record_occupancy refuses a check-in without a signed move-in — so a
 * mismatch means legacy data, and legacy data is skipped rather than
 * printed half-formed.
 */
export async function collectHallwayCheckins(
  supabase: SupabaseClient,
  hallwayId: string,
): Promise<HallwayCheckins | null> {
  const { data: hallway } = await supabase
    .from("hallways")
    .select("id, name")
    .eq("id", hallwayId)
    .single();
  if (!hallway) return null;

  const { data: rooms } = await supabase
    .from("rooms")
    .select("room_number, current_residents ( id, occupancy_status )")
    .eq("hallway_id", hallwayId)
    .overrideTypes<
      {
        room_number: string;
        current_residents: { id: string; occupancy_status: string }[];
      }[]
    >();

  // Occupancy ids of everyone whose check-in is done, kept in room order.
  const checkedIn = (rooms ?? [])
    .flatMap((room) =>
      room.current_residents
        .filter((r) => r.occupancy_status !== "expected")
        .map((r) => ({ room: room.room_number, occupancyId: r.id })),
    )
    .sort((a, b) => byRoomNumber(a.room, b.room));

  if (checkedIn.length === 0) {
    return { hallwayName: hallway.name, inspectionIds: [] };
  }

  const { data: inspections } = await supabase
    .from("inspections")
    .select("id, occupancy_id")
    .eq("type", "move_in")
    .in(
      "occupancy_id",
      checkedIn.map((c) => c.occupancyId),
    )
    .overrideTypes<{ id: string; occupancy_id: string }[]>();

  const moveInOf = new Map(
    (inspections ?? []).map((i) => [i.occupancy_id, i.id]),
  );

  const inspectionIds = checkedIn
    .map((c) => moveInOf.get(c.occupancyId))
    .filter((id): id is string => id !== undefined);

  return { hallwayName: hallway.name, inspectionIds };
}

/** Load and resolve one record, or null if it isn't a printable one. */
export async function loadPrintableRecord(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<InspectionPdfData | null> {
  const record = await loadInspectionRecord(supabase, inspectionId);
  if (
    !record ||
    !record.rooms ||
    !record.occupancies ||
    record.type === "periodic" ||
    !recordComplete(record)
  ) {
    return null;
  }
  return toPdfData(
    supabase,
    record as InspectionRecord & {
      rooms: NonNullable<InspectionRecord["rooms"]>;
      occupancies: NonNullable<InspectionRecord["occupancies"]>;
    },
  );
}
