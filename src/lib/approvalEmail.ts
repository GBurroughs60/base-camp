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

// Rendered at the top of a notification when it went to the fallback
// recipient (currently always Greg) instead of the person it was actually
// meant for -- no manager/agent contact on file, or none with an email.
// Distinct from the rest of the email visually (amber callout) and in
// substance: it explains *why this landed in your inbox* and what to fix,
// rather than reading like a normal targeted notification.
function fallbackBanner(note: string): string {
  return `
    <div style="background: #fff4e5; border: 1px solid #f5c98a; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; color: #7a4a00; font-size: 13px; line-height: 1.4;">
      <strong>You're getting this as the fallback.</strong> ${escapeHtml(note)}
    </div>
  `;
}

export type ApprovalEmailDetails = {
  to: string[];
  cc?: string[];
  artistName: string;
  venueLabel: string;
  location: string | null;
  showDate: string | null;
  guaranteeAmount: number | null;
  dealTerms: string | null;
  capacity: number | null;
  // Public, token-scoped link to the /approve/[token] page -- no Base Camp
  // login involved, since recipients are outside Ridge. This is the only
  // way the actual approve/decline decision makes it back into Base Camp;
  // without it the email is purely informational.
  approveUrl: string;
  // Set when there was no manager/artist contact on file and this went to
  // the fallback recipient instead. Renders an explanatory banner so the
  // fallback recipient understands why they're seeing it and what to fix --
  // see sendApprovalEmailIfNeeded in app/actions/records.ts.
  fallbackNote?: string;
};

// Fires once, the moment a play's status is set to "pending_approval" (see
// sendApprovalEmailIfNeeded in app/actions/records.ts) -- the offer has just
// cleared agent approval and now needs management/the artist to approve it.
// Self-contained (deal details in the body, not just a link) since
// recipients are outside Ridge and don't have Base Camp logins.
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
      ${details.fallbackNote ? fallbackBanner(details.fallbackNote) : ""}
      <h2 style="margin-bottom: 4px;">Offer awaiting your approval: ${escapeHtml(details.artistName)}</h2>
      <p style="color: #555;">This offer has cleared agent review and is ready for your approval. Details:</p>
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
      <a href="${details.approveUrl}" style="display: inline-block; background: #f05a2b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600;">
        Approve or decline this offer
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
    to: details.to,
    ...(details.cc && details.cc.length > 0 ? { cc: details.cc } : {}),
    subject: `Offer awaiting your approval: ${details.artistName} at ${details.venueLabel}`,
    html,
  });

  if (error) {
    // Logged, not thrown -- the play's status change already succeeded and
    // must not be rolled back just because the notification failed.
    console.error("Approval email failed to send:", error);
  }
}

export type ApprovalResponseEmailDetails = {
  to: string;
  decision: "approved" | "declined";
  note: string | null;
  artistName: string;
  venueLabel: string;
  location: string | null;
  showDate: string | null;
  guaranteeAmount: number | null;
  dealTerms: string | null;
  capacity: number | null;
  // Unlike the outbound approval request, this recipient (the booking
  // agent) does have a Base Camp login, so this links straight to the
  // play instead of a public token page.
  playUrl: string;
};

// Fires once, right after management/the artist responds on the public
// /approve/[token] page (see respond() in app/actions/approval.ts) --
// closes the loop back to the agent, who otherwise has no way to know the
// offer they submitted was ever decided without checking the board.
export async function sendApprovalResponseEmail(
  details: ApprovalResponseEmailDetails
): Promise<void> {
  if (!resend) {
    console.warn(
      `RESEND_API_KEY is not set -- skipping approval-response email (would have gone to: ${details.to})`
    );
    return;
  }

  const approved = details.decision === "approved";
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
      <h2 style="margin-bottom: 4px;">
        ${approved ? "Approved" : "Declined"}: ${escapeHtml(details.artistName)} at ${escapeHtml(details.venueLabel)}
      </h2>
      <p style="color: #555;">
        ${approved
          ? "Management/the artist approved this offer -- it's now marked Contract Sent in Base Camp."
          : "Management/the artist declined this offer -- it's now marked Declined in Base Camp."}
      </p>
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
      ${details.note
        ? `<p style="background: #f7f7f7; border-radius: 6px; padding: 10px 14px; color: #333;">
             <strong>Note from management:</strong> ${escapeHtml(details.note)}
           </p>`
        : ""}
      <a href="${details.playUrl}" style="display: inline-block; background: #f05a2b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600;">
        View in Base Camp
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
    to: [details.to],
    subject: `${approved ? "Approved" : "Declined"}: ${details.artistName} at ${details.venueLabel}`,
    html,
  });

  if (error) {
    console.error("Approval-response email failed to send:", error);
  }
}

export type NewOfferEmailDetails = {
  to: string;
  artistName: string;
  buyerName: string;
  venueLabel: string;
  location: string | null;
  showDate: string | null;
  // Unlike the outbound approval request, this recipient (the booking
  // agent) does have a Base Camp login, so this links straight to the
  // play instead of a public token page.
  playUrl: string;
  // Set when there was no agent contact on file and this went to the
  // fallback recipient instead. See fallbackNote on ApprovalEmailDetails.
  fallbackNote?: string;
};

// Fires once, right after a buyer submits the public /book intake form (see
// submitOfferInquiry in app/actions/offerIntake.ts) -- lets the artist's
// booking agent know a new inbound offer landed without them needing to
// check the board. Best-effort only: if no agent is on file for the artist,
// the offer still goes in, there's just no one to notify.
export async function sendNewOfferEmail(details: NewOfferEmailDetails): Promise<void> {
  if (!resend) {
    console.warn(
      `RESEND_API_KEY is not set -- skipping new-offer email (would have gone to: ${details.to})`
    );
    return;
  }

  const rows: [string, string][] = [
    ["Venue", details.venueLabel],
    ...(details.location ? ([["Location", details.location]] as [string, string][]) : []),
    ...(details.showDate ? ([["Date", details.showDate]] as [string, string][]) : []),
    ["Submitted by", details.buyerName],
  ];

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #1a1a1a;">
      ${details.fallbackNote ? fallbackBanner(details.fallbackNote) : ""}
      <h2 style="margin-bottom: 4px;">New offer: ${escapeHtml(details.artistName)} at ${escapeHtml(details.venueLabel)}</h2>
      <p style="color: #555;">A new offer came in through the Base Camp booking form and needs your review.</p>
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
      <a href="${details.playUrl}" style="display: inline-block; background: #f05a2b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600;">
        View in Base Camp
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
    to: [details.to],
    subject: `New offer: ${details.artistName} at ${details.venueLabel}`,
    html,
  });

  if (error) {
    console.error("New-offer email failed to send:", error);
  }
}
