import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" convention (formerly the "middleware" file). Runs before
// matched requests to refresh the staff auth session and guard private routes.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all request paths except static assets and image files. Every
    // route the app serves belongs to a signed-in staff member — there are no
    // machine-to-machine endpoints to exempt.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
