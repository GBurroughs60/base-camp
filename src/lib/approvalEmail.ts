import { Resend } from "resend";

// Lazily constructed so a missing key doesn't crash module load (e.g. in
// local dev before RESEND_API_KEY is set) -- sendApprovalEmail below checks
// for this and no-ops with a console warning instead of throwing, so a
// play's status update always succeeds even if email sending isn't
// configured yet.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMoney(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export type ApprovalEmailDetails = {
  to: string[];
  artistName: string;
  venueLabel: string;
  location: string | null;
  showDate: string | null;
  guaranteeAmount: number | null;
  dealTerms: string | null;
  capacity: number | null;
  playUrl: string;
};

// Fires once, the moment a play's status is set to "contract_sent" (see
// sendApprovalEmailIfNeeded in app/actions/records.ts) -- notifies the
// artist's management/artist contacts that the offer is approved and a
// contract is on the way. Self-contained (deal details in the body, not
// just a link) since recipients are outside Ridge and don't have Base Camp
// logins.
export async function sendApprovalEmail(details: ApprovalEmailDetails): Promise<void> {
  if (!resend) {
    console.warn(
      "RESEND_API_KEY is not set -- skipping approval email (would have gone to: " +
        details.to.join(", ") +
        ")"
    );
    return;
  }

  const rows: [string, string][] = [
    ["Venue", details.venueLabel],
    ...(details.location ? ([["Location", details.location]] as [string, string][]) : []),
    ...(details.showDate ? ([["Date", details.showDate]] as [string, string][]) : []),
    ...(formatMoney(details.guaranteeAmount)
      ? ([["Guarantee", formatMoney(details.guaranteeAmount) as string]] as [string, string][])
      : []),
    ...(details.dealTerms ? ([["Deal terms", details.dealTerms]] as [string, string][]) : []),
    ...(details.capacity != null
      ? ([["Capacity", String(details.capacity)]] as [string, string][])
      : []),
  ];

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Offer approved: ${escapeHtml(details.artistName)}</h2>
      <p style="color: #555;">This offer has been approved and a contract is on its way. Details:</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding: 4px 16px 4px 0; color: #777; vertical-align: top;">${escapeHtml(label)}</td>
            <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(value)}</td>
          </tr>`
          )
          .join("")}
      </table>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
    to: details.to,
    subject: `Offer approved: ${details.artistName} at ${details.venueLabel}`,
    html,
  });

  if (error) {
    // Logged, not thrown -- the play's status change already succeeded and
    // must not be rolled back just because the notification failed.
    console.error("Approval email failed to send:", error);
  }
}
