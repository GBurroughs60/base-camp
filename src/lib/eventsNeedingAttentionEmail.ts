import { Resend } from "resend";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";

// Same lazy-construction / no-op-if-unset pattern as approvalEmail.ts and
// contactDigestEmail.ts -- a best-effort weekly notification, never
// something that should throw and take the cron route down with it.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// A deliberately separate weekly email from the contact digest
// (scan-contacts) rather than folded into it -- different concern
// (dormant events vs. new contact candidates), different underlying
// query, and keeping them apart means either one can change without
// touching the other. A future consolidation into one "weekly Base Camp
// digest" is reasonable if Greg ends up wanting fewer emails, but isn't
// done here.
const DIGEST_RECIPIENTS = [FALLBACK_NOTIFY_EMAIL, "jmayotte@theridgemusicgroup.com"];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type NeedsAttentionEvent = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  venueName: string | null;
};

// Same hardcoded production URL used by approval.ts/offerIntake.ts/
// records.ts for outbound email links -- no shared env-driven base URL
// exists in this codebase yet, so this matches that convention rather
// than introducing a new one.
const BASE_URL = "https://base-camp-lovat.vercel.app";

// Fires weekly from the events-needing-attention cron. Sends only when the
// list is non-empty -- an empty week sends nothing, same convention as the
// contact digest.
export async function sendEventsNeedingAttentionEmail(
  events: NeedsAttentionEvent[]
): Promise<void> {
  if (events.length === 0) return;

  if (!resend) {
    console.warn(
      `RESEND_API_KEY is not set -- skipping events-needing-attention digest (${events.length} event(s) would have been sent to: ${DIGEST_RECIPIENTS.join(", ")})`
    );
    return;
  }

  const rows = events
    .map((e) => {
      const location = [e.city, e.state].filter(Boolean).join(", ") || "—";
      return `
        <tr>
          <td style="padding: 6px 16px 6px 0; vertical-align: top;">
            <a href="${BASE_URL}/events/${e.id}" style="color: #c2410c; text-decoration: none; font-weight: 600;">${escapeHtml(e.name)}</a>
          </td>
          <td style="padding: 6px 16px 6px 0; vertical-align: top;">${escapeHtml(e.venueName ?? "—")}</td>
          <td style="padding: 6px 0; vertical-align: top; color: #555;">${escapeHtml(location)}</td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 640px; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">${events.length} event${events.length === 1 ? "" : "s"} need${events.length === 1 ? "s" : ""} a date</h2>
      <p style="color: #555;">
        These events have no confirmed or estimated occurrence on file that's still ahead of us --
        either nothing was ever found, or the only known date has already passed with no recurring
        pattern to project forward from. They sit outside the catch-up and standing-cadence engines
        until a date is added, either by the next refresh pass or by hand below.
      </p>
      <table style="border-collapse: collapse; margin: 16px 0; width: 100%;">
        <thead>
          <tr style="text-align: left; border-bottom: 2px solid #eee;">
            <th style="padding: 4px 16px 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Event</th>
            <th style="padding: 4px 16px 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Venue</th>
            <th style="padding: 4px 0 8px; color: #999; font-size: 12px; text-transform: uppercase;">Location</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top: 8px;">
        <a href="${BASE_URL}/events?status=needs-date" style="color: #c2410c; text-decoration: none; font-weight: 600;">View the full filtered list in Base Camp →</a>
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
    to: DIGEST_RECIPIENTS,
    subject: `Base Camp: ${events.length} event${events.length === 1 ? "" : "s"} need${events.length === 1 ? "s" : ""} a date`,
    html,
  });

  if (error) {
    // Logged, not thrown -- matches contactDigestEmail.ts's convention.
    console.error("Events-needing-attention digest email failed to send:", error);
  }
}
