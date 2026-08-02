import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" convention (formerly the "middleware" file). Runs before
// matched requests to refresh the staff auth session and guard private routes.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all request paths except static assets, image files, and the
     * cron API (machine-to-machine: it has no browser session and does its
     * own CRON_SECRET bearer check — bouncing it to /login would break the
     * scheduled report).
     */
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
