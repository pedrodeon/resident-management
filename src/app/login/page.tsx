import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/auth";
import { accessDecision } from "@/lib/access";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Staff sign in — Tudor Hall",
};

export default async function LoginPage() {
  const { authenticated, staff } = await getAccessState();
  switch (accessDecision({ authenticated, hasStaffRecord: staff !== null })) {
    case "allow":
      // Already a signed-in staff member — straight to the app.
      redirect("/");
    case "redirect-no-access":
      // Authenticated but no staff row — don't send them to "/", which would
      // bounce right back here. Terminate at the no-access page.
      redirect("/no-access");
    // "redirect-login": not signed in — render the form below.
  }

  return (
    <main className="canvas-v2 flex min-h-screen flex-col items-center justify-center overflow-x-clip px-4 py-12">
      <div className="relative w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold tracking-[0.2em] text-white">
          TUDOR HALL
        </h1>
        <p className="mt-2 text-center text-sm text-white/70">
          Staff sign in — RD and RA accounts only
        </p>

        <div className="mt-8 rounded-[26px] bg-gradient-to-b from-white to-sheet p-6 shadow-[0_22px_50px_rgba(4,10,26,0.45)]">
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-xs text-white/60">
          No account? Staff accounts are created by the Resident Director.
        </p>
      </div>
    </main>
  );
}
