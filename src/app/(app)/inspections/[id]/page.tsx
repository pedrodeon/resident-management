import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { ConditionChip } from "@/components/condition-chip";
import {
  InspectionSignatures,
  type StoredSignature,
  type StoredWaiver,
} from "@/components/inspection-signatures";
import { PHOTO_BUCKET } from "@/lib/photos";
import type { InspectionType, ItemCondition, SignatureRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { PageHeader } from "@/components/ui/page-header";

type InspectionDetail = {
  id: string;
  type: InspectionType;
  timestamp: string;
  notes: string | null;
  rooms: { id: string; room_number: string; hallways: { id: string; name: string } | null } | null;
  // The occupancies TABLE, not the current_residents view: a dispute may be
  // read years later, when that stay is archived or from a past term, and the
  // snapshot must still name who it was about.
  occupancies: {
    id: string;
    occupancy_status: string;
    term: string;
    people: { full_name: string } | null;
  } | null;
  users: { name: string } | null;
  inspection_signatures: {
    role: SignatureRole;
    storage_path: string;
    signed_at: string;
  }[];
  inspection_signature_waivers: {
    reason: string;
    created_at: string;
    users: { name: string } | null;
  } | null;
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
       occupancies ( id, occupancy_status, term, people ( full_name ) ),
       users:inspected_by ( name ),
       inspection_signatures ( role, storage_path, signed_at ),
       inspection_signature_waivers ( reason, created_at, users:waived_by ( name ) ),
       inspection_items ( id, condition, note,
                          inventory_items ( name, sort_order ),
                          inspection_photos ( id, storage_path ) )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<InspectionDetail>();

  if (error || !inspection || !inspection.rooms) notFound();

  // The attestation step applies to move-in and move-out inspections tied to a
  // stay. The gate: RA signature AND (resident signature OR, for move-out only,
  // a recorded waiver).
  const stay = inspection.occupancies;
  const residentName = stay?.people?.full_name ?? null;
  const signable =
    (inspection.type === "move_in" || inspection.type === "move_out") &&
    stay !== null;
  const staff = signable ? await getStaffContext() : null;
  const waiverRow = inspection.inspection_signature_waivers;
  const roles = new Set(inspection.inspection_signatures.map((s) => s.role));
  const gateSatisfied =
    roles.has("ra") && (roles.has("resident") || waiverRow !== null);

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
  const room = inspection.rooms;

  return (
    <section>
      <PageHeader back={{ href: `/rooms/${room.id}`, label: `Room ${room.room_number}` }} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PageTitle>{TYPE_LABEL[inspection.type]} inspection</PageTitle>
        {signable && !gateSatisfied && (
          <Badge tone="attention">awaiting signatures</Badge>
        )}
        {/* The liability record: only a COMPLETE inspection (both halves of
            the signature gate) exports; the route re-checks the same rule. */}
        {signable && gateSatisfied && (
          <a
            href={`/api/inspections/${inspection.id}/pdf`}
            className="rounded-full border border-white/30 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15"
          >
            Download PDF
          </a>
        )}
      </div>

<Card variant="sheet" className="mt-6">
      {inspection.notes && (
        <Card as="p" variant="note">
          {inspection.notes}
        </Card>
      )}

      <Card as="ul" variant="list" className="mt-4 first:mt-0">
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
      </Card>

      {/* Attestations: resident + RA sign against this exact snapshot; the
          check-in / check-out cannot be finalized until the gate is met. */}
      {signable && stay && (
        <InspectionSignatures
          mode={inspection.type as "move_in" | "move_out"}
          inspectionId={inspection.id}
          occupancyId={stay.id}
          residentName={residentName ?? "the resident"}
          staffName={staff?.name ?? "RA"}
          hallwayId={room.hallways?.id ?? null}
          occupancyStatus={stay.occupancy_status}
          stored={inspection.inspection_signatures.flatMap(
            (s): StoredSignature[] => {
              const url = signedByPath.get(s.storage_path);
              return url
                ? [{ role: s.role, url, signed_at: s.signed_at }]
                : [];
            },
          )}
          waiver={
            waiverRow
              ? ({
                  reason: waiverRow.reason,
                  waivedByName: waiverRow.users?.name ?? "staff",
                  created_at: waiverRow.created_at,
                } satisfies StoredWaiver)
              : null
          }
        />
      )}
      </Card>
    </section>
  );
}
