import { Resend } from "resend";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";

// Same lazy-construction / no-op-if-unset pattern as approvalEmail.ts --
// this is a best-effort weekly notification, not something that should
// ever throw and take the cron route down with it.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type DigestCandidate = {
  email: string;
  inferredName: string | null;
  inferredCompanyName: string | null;
};

// Recipients are fixed per Greg's explicit call -- both him and Justin see
// every digest, regardless of which of their two inboxes a given address
// actually came from.
const DIGEST_RECIPIENTS = [FALLBACK_NOTIFY_EMAIL, "jmayotte@theridgemusicgroup.com"];

// Tab-separated so it pastes cleanly into a spreadsheet or a textarea that
// splits on tabs -- this is the exact format the Phase 1.5 bulk-import
// screen should expect to parse (Name, Email, Company, one row per line).
function toPasteableBlock(candidates: DigestCandidate[]): string {
  return candidates
    .map((c) => [c.inferredName ?? "", c.email, c.inferredCompanyName ?? ""].join("\t"))
    .join("\n");
}

// Fires once a week from the scan-contacts cron route, and only when there
// is at least one genuinely new address (see newThisRun in that route) --
// a run that finds nothing new sends no email at all rather than an empty
// digest.
export async function sendContactDigestEmail(candidates: DigestCandidate[]): Promise<void> {
  if (candidates.length === 0) return;

  if (!resend) {
    console.warn(
      `RESEND_API_KEY is not set -- skipping contact digest email (${candidates.length} new candidate(s) would have been sent to: ${DIGEST_RECIPIENTS.join(", ")})`
    );
    return;
  }

  const rows = candidates
    .map(
      (c) => `
        <tr>
          <td style="padding: 6px 16px 6px 0; vertical-align: top;">${escapeHtml(c.inferredName ?? "—")}</td>
          <td style="padding: 6px 16px 6px 0; vertical-align: top; font-weight: 600;">${escapeHtml(c.email)}</td>
          <td style="padding: 6px 0; vertical-align: top; color: #555;">${escapeHtml(c.inferredCompanyName ?? "—")}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 640px; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">${candidates.length} new contact${candidates.length === 1 ? "" : "s"} found this week</h2>
      <p style="color: #555;">
        Pulled from Greg's and Justin's inboxes over the last week. Review below -- nothing has been
        added to Base Camp automatically. Addresses already dismissed or previously imported never
        show up again.
      </p>
      <table style="border-collapse: collapse; margin: 16px 0; width: 100%;">
        <thead>
          <tr style="text-align: left; border-bottom: 2px solid #eee;">
            <th style="padding: 4px 16px 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Name</th>
            <th style="padding: 4px 16px 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Email</th>
            <th style="padding: 4px 0 8px; color: #999; font-size: 12px; text-transform: uppercase;">Best-guess company</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color: #999; font-size: 12px; margin-top: 8px;">
        Plain-text block below is pasteable straight into a spreadsheet (Name, Email, Company columns):
      </p>
      <pre style="background: #f7f7f7; border-radius: 6px; padding: 12px 14px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere;">${escapeHtml(toPasteableBlock(candidates))}</pre>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
    to: DIGEST_RECIPIENTS,
    subject: `Base Camp: ${candidates.length} new contact${candidates.length === 1 ? "" : "s"} found this week`,
    html,
  });

  if (error) {
    // Logged, not thrown -- the candidates row(s) are already committed to
    // the database by the time this is called, so a delivery failure here
    // shouldn't be treated as the whole cron run failing.
    console.error("Contact digest email failed to send:", error);
  }
}
