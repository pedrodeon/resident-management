import "server-only";

/*
 * Resend, via its plain REST API — deliberately no SDK dependency. The API key
 * and every address live in environment variables (docs/SETUP.md):
 *
 *   RESEND_API_KEY        server-only key; `server-only` above makes any
 *                         client-side import a build error
 *   EMAIL_FROM            verified sender, e.g. "Tudor Hall <reports@…>"
 *   RD_EMAIL              where both report types go — the RD's address
 *
 * Emails are plain text on purpose: they must read identically in every
 * client, and there is nothing here that needs layout.
 */

export type EmailResult = { ok: true } | { ok: false; error: string };

/** Split a comma-separated env var into trimmed, non-empty addresses. */
export function recipientsFromEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

export async function sendEmail({
  to,
  cc,
  replyTo,
  subject,
  text,
}: {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      ok: false,
      error:
        "Email isn't configured yet: set RESEND_API_KEY and EMAIL_FROM in .env.local (see docs/SETUP.md).",
    };
  }
  if (to.length === 0) {
    return { ok: false, error: "No recipients configured for this report type." };
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        ...(cc && cc.length > 0 ? { cc } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        text,
      }),
    });
  } catch (cause) {
    return {
      ok: false,
      error: `Could not reach the email service: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      // keep the status-code detail
    }
    return { ok: false, error: `Email service rejected the message: ${detail}` };
  }
  return { ok: true };
}
