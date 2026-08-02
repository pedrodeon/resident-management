import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Set your password — Tudor Hall" };

/**
 * Where the app shell sends anyone whose account still carries the seeded
 * temporary password (users.must_change_password). Lives OUTSIDE the (app)
 * group on purpose — the shell redirects flagged users here, so this page
 * must not sit behind that same redirect (that pairing is how login loops
 * happen). Also reachable voluntarily by any signed-in staff member who
 * just wants a new password.
 */
export default async function ChangePasswordPage() {
  const { authenticated, staff } = await getAccessState();
  if (!authenticated) redirect("/login");
  if (!staff) redirect("/no-access");

  return (
    <main className="canvas-v2 flex min-h-screen flex-col items-center justify-center overflow-x-clip px-4 py-12">
      <div className="relative w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold tracking-[0.2em] text-white">
          TUDOR HALL
        </h1>
        <p className="mt-2 text-center text-sm text-white/70">
          {staff.mustChangePassword
            ? "Welcome! Set your own password to start using the app."
            : "Choose a new password."}
        </p>

        <div className="mt-8 rounded-[26px] bg-gradient-to-b from-white to-sheet p-6 shadow-[0_22px_50px_rgba(4,10,26,0.45)]">
          <ChangePasswordForm />
        </div>

        <p className="mt-4 text-center text-xs text-white/60">
          Signed in as {staff.email ?? staff.name}
        </p>
      </div>
    </main>
  );
}
