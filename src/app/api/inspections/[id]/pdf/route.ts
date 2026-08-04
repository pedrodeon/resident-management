import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { PHOTO_BUCKET } from "@/lib/photos";
import {
  renderInspectionPdf,
  type InspectionPdfData,
  type PdfPhoto,
  type PdfSignature,
} from "@/lib/inspection-pdf";

type Row = {
  id: string;
  type: "move_in" | "move_out" | "periodic";
  timestamp: string;
  notes: string | null;
  rooms: { room_number: string; hallways: { name: string } | null } | null;
  occupancies: {
    term: string;
    people: { full_name: string; student_id: string } | null;
  } | null;
  users: { name: string } | null;
  inspection_signatures: {
    role: "resident" | "ra";
    storage_path: string;
    signed_at: string;
    captured: { name: string } | null;
  }[];
  inspection_signature_waivers: {
    reason: string;
    created_at: string;
    users: { name: string } | null;
  } | null;
  inspection_items: {
    condition: string;
    note: string | null;
    inventory_items: { name: string; sort_order: number } | null;
    inspection_photos: { storage_path: string }[];
  }[];
};

/**
 * The inspection record as a PDF — the damage-liability document.
 *
 * Read-only by construction: every read (rows AND storage blobs) goes
 * through the caller's RLS-scoped client, and only completed records —
 * RA signature plus resident signature or waiver — are rendered. The
 * filename carries room + date only; resident data never enters a URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffContext();
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: inspection, error } = await supabase
    .from("inspections")
    .select(
      `id, type, timestamp, notes,
       rooms ( room_number, hallways ( name ) ),
       occupancies ( term, people ( full_name, student_id ) ),
       users:inspected_by ( name ),
       inspection_signatures ( role, storage_path, signed_at, captured:captured_by ( name ) ),
       inspection_signature_waivers ( reason, created_at, users:waived_by ( name ) ),
       inspection_items ( condition, note,
                          inventory_items ( name, sort_order ),
                          inspection_photos ( storage_path ) )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<Row>();

  if (error || !inspection || !inspection.rooms || !inspection.occupancies) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (inspection.type === "periodic") {
    return NextResponse.json(
      { error: "legacy periodic inspections have no signed record" },
      { status: 409 },
    );
  }

  const roles = new Set(inspection.inspection_signatures.map((s) => s.role));
  const waiver = inspection.inspection_signature_waivers;
  const complete = roles.has("ra") && (roles.has("resident") || waiver !== null);
  if (!complete) {
    return NextResponse.json(
      { error: "this inspection is not fully signed yet" },
      { status: 409 },
    );
  }

  // Blobs come through the caller's storage client — same policies as the app.
  const download = async (path: string): Promise<Buffer | null> => {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).download(path);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };

  const resident = inspection.occupancies.people;
  const items = [...inspection.inspection_items].sort(
    (a, b) => (a.inventory_items?.sort_order ?? 0) - (b.inventory_items?.sort_order ?? 0),
  );

  const signatures: PdfSignature[] = await Promise.all(
    inspection.inspection_signatures.map(async (s) => ({
      role: s.role,
      signedAt: s.signed_at,
      signerName:
        s.role === "resident"
          ? (resident?.full_name ?? "Resident")
          : (s.captured?.name ?? "RA"),
      png: await download(s.storage_path),
    })),
  );

  const photos: PdfPhoto[] = (
    await Promise.all(
      items.flatMap((item) =>
        item.inspection_photos.map(async (p) => ({
          itemName: item.inventory_items?.name ?? "Item",
          jpeg: await download(p.storage_path),
        })),
      ),
    )
  );

  const data: InspectionPdfData = {
    type: inspection.type,
    residentName: resident?.full_name ?? "—",
    studentId: resident?.student_id ?? "—",
    roomNumber: inspection.rooms.room_number,
    hallwayName: inspection.rooms.hallways?.name ?? "—",
    term: inspection.occupancies.term,
    inspectedAt: inspection.timestamp,
    inspectorName: inspection.users?.name ?? "—",
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
            recordedBy: waiver.users?.name ?? "staff",
            recordedAt: waiver.created_at,
          }
        : null,
  };

  const pdf = await renderInspectionPdf(data);

  // Room + date only in the filename — never resident data.
  const date = new Date(inspection.timestamp)
    .toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const filename = `${inspection.type === "move_in" ? "move-in" : "move-out"}-room-${inspection.rooms.room_number}-${date}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
