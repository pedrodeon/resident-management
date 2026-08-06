/**
 * How a record names the staff member who made it, once that person has been
 * removed. The record survives them (an incident, a signed inspection, a shift
 * all outlive the RA who filed them), so the row says who it was — or says
 * plainly that they are gone, rather than pretending nobody did it.
 */
export const FORMER_STAFF = "Former staff";

/** `name` from a joined users row, or the removed-staff label. */
export function staffName(user: { name: string } | null | undefined): string {
  return user?.name ?? FORMER_STAFF;
}
