import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import {
  loadInspectionRecord,
  recordComplete,
  sortedItems,
} from "@/lib/inspection-record";
import { PHOTO_BUCKET } from "@/lib/photos";
import {
  renderInspectionPdf,
  type InspectionPdfData,
  type PdfPhoto,
  type PdfSignature,
} from "@/lib/inspection-pdf";

/**
 * The inspection record as a PDF — the damage-liability document. Loads
 * through the same `loadInspectionRecord` as the on-screen record view, so
 * the two can never disagree.
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
  const inspection = await loadInspectionRecord(supabase, id);

  if (!inspection || !inspection.rooms || !inspection.occupancies) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (inspection.type === "periodic") {
    return NextResponse.json(
      { error: "legacy periodic inspections have no signed record" },
      { status: 409 },
    );
  }
  if (!recordComplete(inspection)) {
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
          : (s.captured?.name ?? "RA"),
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
