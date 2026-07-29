import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { BackLink } from "@/components/back-link";
import { ConditionChip } from "@/components/condition-chip";
import {
  InspectionSignatures,
  type StoredSignature,
} from "@/components/inspection-signatures";
import { PHOTO_BUCKET } from "@/lib/photos";
import type { InspectionType, ItemCondition, SignatureRole } from "@/lib/types";

type InspectionDetail = {
  id: string;
  type: InspectionType;
  timestamp: string;
  notes: string | null;
  rooms: { id: string; room_number: string; hallways: { id: string; name: string } | null } | null;
  residents: { id: string; full_name: string; occupancy_status: string } | null;
  users: { name: string } | null;
  inspection_signatures: {
    role: SignatureRole;
    storage_path: string;
    signed_at: string;
  }[];
  inspection_items: {
    id: string;
    condition: ItemCondition;
    note: string | null;
    inventory_items: { name: string; sort_order: number } | null;
    inspection_photos: { id: string; storage_path: string }[];
  }[];
};

const TYPE_LABEL: Record<InspectionType, string> = {
  move_in: "Move-in",
  move_out: "Move-out",
  periodic: "Periodic",
};

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: inspection, error } = await supabase
    .from("inspections")
    .select(
      `id, type, timestamp, notes,
       rooms ( id, room_number, hallways ( id, name ) ),
       residents ( id, full_name, occupancy_status ),
       users:inspected_by ( name ),
       inspection_signatures ( role, storage_path, signed_at ),
       inspection_items ( id, condition, note,
                          inventory_items ( name, sort_order ),
                          inspection_photos ( id, storage_path ) )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<InspectionDetail>();

  if (error || !inspection || !inspection.rooms) notFound();

  // The attestation step applies to move-in inspections tied to a resident.
  const signable = inspection.type === "move_in" && inspection.residents !== null;
  const staff = signable ? await getStaffContext() : null;

  const items = [...inspection.inspection_items].sort(
    (a, b) =>
      (a.inventory_items?.sort_order ?? 0) - (b.inventory_items?.sort_order ?? 0),
  );

  // Short-lived signed URLs for the private bucket, minted under the caller's
  // RLS — only staff who can SELECT the objects get URLs. Never public URLs.
  // Photos and signature images live in the same bucket.
  const allPaths = [
    ...items.flatMap((i) => i.inspection_photos.map((p) => p.storage_path)),
    ...inspection.inspection_signatures.map((s) => s.storage_path),
  ];
  const signedByPath = new Map<string, string>();
  if (allPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(allPaths, 3600);
    for (const entry of signed ?? []) {
      if (entry.signedUrl && entry.path) {
        signedByPath.set(entry.path, entry.signedUrl);
      }
    }
  }
  const date = new Date(inspection.timestamp).toLocaleString();
  const room = inspection.rooms;

  return (
    <section>
      {/* Up one level: inspection snapshot → its room. */}
      <div className="mb-3">
        <BackLink href={`/rooms/${room.id}`} label={`Room ${room.room_number}`} />
      </div>

      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-navy hover:underline">
          TUDOR HALL
        </Link>{" "}
        /{" "}
        {room.hallways && (
          <>
            <Link
              href={`/hallways/${room.hallways.id}`}
              className="hover:text-navy hover:underline"
            >
              {room.hallways.name}
            </Link>{" "}
            /{" "}
          </>
        )}
        <Link
          href={`/rooms/${room.id}`}
          className="hover:text-navy hover:underline"
        >
          Room {room.room_number}
        </Link>{" "}
        / Inspection
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold text-navy">
          {TYPE_LABEL[inspection.type]} inspection
        </h1>
        <span className="text-sm text-gray-500">{date}</span>
        {signable && inspection.inspection_signatures.length < 2 && (
          <span className="rounded-full border-l-4 border-accent bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-ink">
            awaiting signatures
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Room {room.room_number}
        {inspection.residents ? ` · ${inspection.residents.full_name}` : ""}
        {inspection.users ? ` · by ${inspection.users.name}` : ""}
      </p>

      {inspection.notes && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          {inspection.notes}
        </p>
      )}

      <ul className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
          >
            <div>
              <span className="text-sm font-medium">
                {item.inventory_items?.name}
              </span>
              {item.note && (
                <span className="ml-2 text-xs text-gray-500">{item.note}</span>
              )}
            </div>
            <ConditionChip condition={item.condition} />
            {item.inspection_photos.length > 0 && (
              <div className="flex w-full flex-wrap gap-2">
                {item.inspection_photos.map((photo) => {
                  const url = signedByPath.get(photo.storage_path);
                  if (!url) return null;
                  return (
                    <a
                      key={photo.id}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open full size"
                    >
                      {/* Signed URLs are short-lived; plain img, no optimizer. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`${item.inventory_items?.name} photo`}
                        className="h-20 w-20 rounded-md border border-gray-200 object-cover"
                      />
                    </a>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Attestations: resident + RA sign against this exact snapshot; the
          check-in cannot be finalized until both exist. */}
      {signable && inspection.residents && (
        <InspectionSignatures
          inspectionId={inspection.id}
          residentId={inspection.residents.id}
          residentName={inspection.residents.full_name}
          staffName={staff?.name ?? "RA"}
          hallwayId={room.hallways?.id ?? null}
          residentStatus={inspection.residents.occupancy_status}
          stored={inspection.inspection_signatures.flatMap(
            (s): StoredSignature[] => {
              const url = signedByPath.get(s.storage_path);
              return url
                ? [{ role: s.role, url, signed_at: s.signed_at }]
                : [];
            },
          )}
        />
      )}
    </section>
  );
}
