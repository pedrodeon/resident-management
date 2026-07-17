import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Staff sign in — Tudor Hall",
};

export default async function LoginPage() {
  // Already signed in? Straight to the app.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold tracking-[0.2em] text-white">
          TUDOR HALL
        </h1>
        <p className="mt-2 text-center text-sm text-white/70">
          Staff sign in — RD and RA accounts only
        </p>

        <div className="mt-8 rounded-lg bg-white p-6 shadow-lg">
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-xs text-white/60">
          No account? Staff accounts are created by the Resident Director.
        </p>
      </div>
    </main>
  );
}
