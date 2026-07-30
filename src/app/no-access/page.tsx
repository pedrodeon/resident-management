import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/auth";
import { signOut } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "No access — Tudor Hall",
};

// Deliberately OUTSIDE the (app) route group, so it is not subject to the
// staff-record guard that sends no-staff users here — otherwise this page
// would redirect to itself.
export default async function NoAccessPage() {
  const { authenticated, staff } = await getAccessState();
  // The proxy already bounces unauthenticated requests to /login; guard here
  // too for defense-in-depth. A valid staff member has no reason to be here.
  if (!authenticated) redirect("/login");
  if (staff) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-navy-dark to-navy px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold tracking-[0.2em] text-white">
          TUDOR HALL
        </h1>

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-navy">Account not set up</h2>
          <p className="mt-2 text-sm text-gray-600">
            You&rsquo;re signed in, but this login isn&rsquo;t linked to a staff
            record yet. Ask the Resident Director to add your account, then sign
            in again.
          </p>

          <form action={signOut} className="mt-6">
            <Button type="submit" size="lg" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
