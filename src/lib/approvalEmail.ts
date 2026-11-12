import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";

// Lazily constructed so a missing key doesn't crash module load (e.g. in
// local dev before RESEND_API_KEY is set) -- sendApprovalEmail below checks
// for this and no-ops with a console warning instead of throwing, so a
// play's status update always succeeds even if email sending isn't
// configured yet.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Direct, synchronous backup notification to Greg every time any automated
// email fails to send (not just settlement -- logEmailFailure is the one
// place every notification kind in this app already funnels through, so
// this is a single change that covers all of them). Previously a failure
// only ever reached email_notification_failures, a table nothing reads
// automatically yet ("daily health check" was aspirational, not built --
// see the comment on logEmailFailure below) -- so a failed send could sit
// there unnoticed indefinitely. This is a *best-effort* second attempt
// over the same provider, not a second channel: if Resend itself is down
// or misconfigured, this alert can fail right alongside the email it's
// reporting on, same as the fundamental limit on the "no contact on file"
// fallback elsewhere in this file. Deliberately never calls logEmailFailure
// on its own failure -- that would recurse.
async function alertGregOfEmailFailure(
  emailKind: string,
  recipient: string,
  errorDetail: string
): Promise<void> {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
      to: [FALLBACK_NOTIFY_EMAIL],
      subject: `Base Camp: an automated email failed to send (${emailKind})`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #1a1a1a;">
          <p>A <strong>${escapeHtml(emailKind)}</strong> notification failed to send to
          <strong>${escapeHtml(recipient)}</strong>.</p>
          <p style="color: #777; font-size: 13px;">${escapeHtml(errorDetail)}</p>
          <p style="color: #999; font-size: 12px; margin-top: 16px;">
            Logged in email_notification_failures. Sent automatically by Base Camp.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("alertGregOfEmailFailure itself failed to send:", err);
  }
}

// Best-effort safety net, same spirit as offer_inquiry_attempts (see
// offerIntake.ts): every real notification failure below is saved here
// before anything else, so it shows up in a daily health check instead of
// only ever reaching a server log nobody's watching -- though that health
// check doesn't exist yet as its own job; alertGregOfEmailFailure above is
// what currently gets a failure in front of a person right away rather
// than waiting on one to be built. Logging itself must never throw -- a
// failed log write is still just console.error'd, same as the email
// failure it was trying to record.
// Exported (unlike every other helper in this file) so the Resend bounce
// webhook (api/webhooks/resend/route.ts) can log through the exact same
// path -- same table, same best-effort direct alert to Greg via
// alertGregOfEmailFailure above -- rather than duplicating either piece.
export async function logEmailFailure(
  emailKind:
    | "approval_request"
    | "approval_response"
    | "new_offer"
    | "settlement_request"
    | "settlement_received"
    | "settlement_escalation"
    | "email_bounce"
    | "commission_invoice_blocked"
    | "commission_invoice_manager_notice",
  recipient: string,
  context: Record<string, unknown>,
  errorDetail: string
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("log_email_notification_failure", {
      p_email_kind: emailKind,
      p_recipient: recipient,
      p_context: context,
      p_error_detail: errorDetail,
    });
  } catch (err) {
    console.error("email-notification-failure log itself failed:", err);
  }
  await alertGregOfEmailFailure(emailKind, recipient, errorDetail);
}

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

  // Wrapped in try/catch, not just a check on the returned `error` field --
  // the Resend SDK call itself can throw (e.g. a network error) rather than
  // resolving with { error }, and previously that would propagate straight
  // out of this function uncaught. Since every call site awaits this
  // function bare (see records.ts/approval.ts), an uncaught throw here used
  // to fail the whole server action, including DB writes that had already
  // happened (approval_token/approval_email_sent_at below) or hadn't
  // happened yet -- for a problem that's just a notification, not the real
  // state change. Always logged, never rethrown either way -- the play's
  // status change already succeeded and must not be rolled back just
  // because the notification failed.
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
      to: details.to,
      ...(details.cc && details.cc.length > 0 ? { cc: details.cc } : {}),
      subject: `Offer awaiting your approval: ${details.artistName} at ${details.venueLabel}`,
      html,
    });

    if (error) {
      console.error("Approval email failed to send:", error);
      await logEmailFailure(
        "approval_request",
        details.to.join(", "),
        { artistName: details.artistName, venueLabel: details.venueLabel, approveUrl: details.approveUrl },
        JSON.stringify(error)
      );
    }
  } catch (err) {
    console.error("Approval email threw while sending:", err);
    await logEmailFailure(
      "approval_request",
      details.to.join(", "),
      { artistName: details.artistName, venueLabel: details.venueLabel, approveUrl: details.approveUrl },
      err instanceof Error ? err.message : String(err)
    );
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
  // Set on every approval (undefined on a decline, where there's no
  // contract to review) -- points at the Contract Review screen instead
  // of handing the agent a raw file. Deliberately not an attachment: the
  // only way to fix a mistake in a generated contract is to correct the
  // underlying field and regenerate, and an emailed copy invites
  // hand-editing the Word file instead, which silently drifts from the
  // database. The review screen builds its own data and offers its own
  // Generate action, so this link is always the right one to send on an
  // approval regardless of anything having been generated yet.
  contractReviewUrl?: string;
  // Set when there was no agent contact on file (or none with an email)
  // and this went to the fallback recipient instead. See fallbackNote on
  // ApprovalEmailDetails -- same convention across all three automated
  // notifications.
  fallbackNote?: string;
};

// Fires once, right after management/the artist responds on the public
// /approve/[token] page (see respond() in app/actions/approval.ts) --
// closes the loop back to the agent, who otherwise has no way to know the
// offer they submitted was ever decided without checking the board. On an
// approval, this is also the moment the agent is pointed at the generated
// contract -- see contractReviewUrl above.
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
      ${details.fallbackNote ? fallbackBanner(details.fallbackNote) : ""}
      <h2 style="margin-bottom: 4px;">
        ${approved ? "Approved" : "Declined"}: ${escapeHtml(details.artistName)} at ${escapeHtml(details.venueLabel)}
      </h2>
      <p style="color: #555;">
        ${approved
          ? "Management/the artist approved this offer -- it's now marked Contract Sent in Base Camp. Review the contract there before it goes out to the buyer."
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
      <a href="${details.contractReviewUrl ?? details.playUrl}" style="display: inline-block; background: #f05a2b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600;">
        ${details.contractReviewUrl ? "Review the contract" : "View in Base Camp"}
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  // See the matching try/catch in sendApprovalEmail above for why this is
  // wrapped rather than just checking the returned `error` field -- same
  // reasoning applies here, and this one's call site (approval.ts's public
  // respond() action) is reached by an outside venue/management contact
  // with no Base Camp login, so a thrown, uncaught error here used to risk
  // showing them a broken page even though their approve/decline decision
  // had already been recorded via the RPC just above this call.
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
      to: [details.to],
      subject: `${approved ? "Approved" : "Declined"}: ${details.artistName} at ${details.venueLabel}`,
      html,
    });

    if (error) {
      console.error("Approval-response email failed to send:", error);
      await logEmailFailure(
        "approval_response",
        details.to,
        { artistName: details.artistName, venueLabel: details.venueLabel, decision: details.decision },
        JSON.stringify(error)
      );
    }
  } catch (err) {
    console.error("Approval-response email threw while sending:", err);
    await logEmailFailure(
      "approval_response",
      details.to,
      { artistName: details.artistName, venueLabel: details.venueLabel, decision: details.decision },
      err instanceof Error ? err.message : String(err)
    );
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

  // See the matching try/catch in sendApprovalEmail above -- same reasoning.
  // offerIntake.ts's own caller already wraps this whole function in a
  // .catch(), so a thrown error here was already being swallowed safely
  // rather than blowing up the submission; this still logs it to the same
  // place the other two notifications do, so it shows up in the daily
  // health check instead of only a server log.
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
      to: [details.to],
      subject: `New offer: ${details.artistName} at ${details.venueLabel}`,
      html,
    });

    if (error) {
      console.error("New-offer email failed to send:", error);
      await logEmailFailure(
        "new_offer",
        details.to,
        { artistName: details.artistName, venueLabel: details.venueLabel, buyerName: details.buyerName },
        JSON.stringify(error)
      );
    }
  } catch (err) {
    console.error("New-offer email threw while sending:", err);
    await logEmailFailure(
      "new_offer",
      details.to,
      { artistName: details.artistName, venueLabel: details.venueLabel, buyerName: details.buyerName },
      err instanceof Error ? err.message : String(err)
    );
  }
}

export type SettlementRequestEmailDetails = {
  // Flipped from ApprovalEmailDetails's convention on purpose -- Greg's
  // instruction was explicit: "the artist on the play should be the one
  // filling out the form," with management cc'd rather than primary, since
  // management already approved the offer and just needs visibility into
  // what actually happened at the show.
  to: string[];
  cc?: string[];
  artistName: string;
  venueLabel: string;
  location: string | null;
  showDate: string | null;
  guaranteeAmount: number | null;
  // Public, token-scoped link to the /settle/[token] page -- no Base Camp
  // login involved, same reasoning as approveUrl on ApprovalEmailDetails.
  settleUrl: string;
  fallbackNote?: string;
  // Set on every re-send after the first -- see send-settlement-reminders
  // cron -- so the subject/copy reads as a follow-up rather than repeating
  // the original "how did it go?" verbatim every 3 days.
  reminder?: boolean;
};

// Fires once per play, the moment it's advanced to "played" with no
// settlement report requested yet (see the settlement-email step in
// api/cron/advance-plays-to-played/route.ts -- deliberately not wired into
// updateField/sendApprovalEmailIfNeeded, since a play can reach "played" in
// bulk via that cron rather than through a single UI-initiated status edit).
// Also re-sent on a 3-day cadence by send-settlement-reminders (reminder:
// true) for any play whose report hasn't come in yet.
export async function sendSettlementRequestEmail(details: SettlementRequestEmailDetails): Promise<void> {
  if (!resend) {
    console.warn(
      "RESEND_API_KEY is not set -- skipping settlement-request email (would have gone to: " +
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
  ];

  const heading = details.reminder
    ? `Reminder: how did it go? ${escapeHtml(details.artistName)} at ${escapeHtml(details.venueLabel)}`
    : `How did it go? ${escapeHtml(details.artistName)} at ${escapeHtml(details.venueLabel)}`;
  const intro = details.reminder
    ? "Just following up -- we haven't seen a post-show report for this one yet. Walkout, merch, any expenses, and whether you'd play this room again:"
    : "Now that the show's played, we'd love a quick post-show report -- walkout, merch, any expenses, and whether you'd play this room again.";

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #1a1a1a;">
      ${details.fallbackNote ? fallbackBanner(details.fallbackNote) : ""}
      <h2 style="margin-bottom: 4px;">${heading}</h2>
      <p style="color: #555;">${intro}</p>
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
      <a href="${details.settleUrl}" style="display: inline-block; background: #f05a2b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600;">
        Submit post-show report
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  const subject = details.reminder
    ? `Reminder: how did it go? ${details.artistName} at ${details.venueLabel}`
    : `How did it go? ${details.artistName} at ${details.venueLabel}`;

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
      to: details.to,
      ...(details.cc && details.cc.length > 0 ? { cc: details.cc } : {}),
      subject,
      html,
    });

    if (error) {
      console.error("Settlement-request email failed to send:", error);
      await logEmailFailure(
        "settlement_request",
        details.to.join(", "),
        { artistName: details.artistName, venueLabel: details.venueLabel, settleUrl: details.settleUrl, reminder: !!details.reminder },
        JSON.stringify(error)
      );
    }
  } catch (err) {
    console.error("Settlement-request email threw while sending:", err);
    await logEmailFailure(
      "settlement_request",
      details.to.join(", "),
      { artistName: details.artistName, venueLabel: details.venueLabel, settleUrl: details.settleUrl, reminder: !!details.reminder },
      err instanceof Error ? err.message : String(err)
    );
  }
}

export type SettlementEscalationEmailDetails = {
  // Always Greg -- this isn't a fallback for a missing contact, it's a
  // "nobody's responded after repeated reminders" notice, so it goes
  // straight to him regardless of whether the artist has a contact on
  // file. See send-settlement-reminders.
  artistName: string;
  venueLabel: string;
  showDate: string | null;
  reminderCount: number;
  // Recipient has a Base Camp login, so this links straight to the play
  // rather than the public token page.
  playUrl: string;
};

// Fires once per play, the moment its reminder count crosses the cap with
// still no report in hand (see send-settlement-reminders) -- stops the
// automated nudging at that point and hands it to Greg to follow up
// manually instead of emailing the artist indefinitely forever.
export async function sendSettlementEscalationEmail(details: SettlementEscalationEmailDetails): Promise<void> {
  if (!resend) {
    console.warn(
      `RESEND_API_KEY is not set -- skipping settlement-escalation email for ${details.artistName} at ${details.venueLabel}`
    );
    return;
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">No settlement report yet: ${escapeHtml(details.artistName)} at ${escapeHtml(details.venueLabel)}</h2>
      <p style="color: #555;">
        ${details.reminderCount} reminder${details.reminderCount === 1 ? "" : "s"} went out and this one still hasn't
        reported back. Automated reminders have stopped for this play -- might be worth a direct follow-up, or just
        fill it in yourself from what you know.
      </p>
      <a href="${details.playUrl}" style="display: inline-block; background: #f05a2b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600;">
        View in Base Camp
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
      to: [FALLBACK_NOTIFY_EMAIL],
      subject: `No settlement report yet: ${details.artistName} at ${details.venueLabel}`,
      html,
    });

    if (error) {
      console.error("Settlement-escalation email failed to send:", error);
      await logEmailFailure(
        "settlement_escalation",
        FALLBACK_NOTIFY_EMAIL,
        { artistName: details.artistName, venueLabel: details.venueLabel, reminderCount: details.reminderCount },
        JSON.stringify(error)
      );
    }
  } catch (err) {
    console.error("Settlement-escalation email threw while sending:", err);
    await logEmailFailure(
      "settlement_escalation",
      FALLBACK_NOTIFY_EMAIL,
      { artistName: details.artistName, venueLabel: details.venueLabel, reminderCount: details.reminderCount },
      err instanceof Error ? err.message : String(err)
    );
  }
}

export type SettlementReceivedEmailDetails = {
  // Booking agent, same as ApprovalResponseEmailDetails -- closes the loop
  // back to the agent, who otherwise has no way to know a report came in
  // without checking the board. Falls back to Greg when no agent is on
  // file, same convention as the other three automated notifications.
  to: string;
  artistName: string;
  venueLabel: string;
  showDate: string | null;
  walkoutAmount: number | null;
  grossMerchSales: number | null;
  wouldPlayAgain: string | null;
  // Recipient has a Base Camp login, so this links straight to the play
  // (same reasoning as playUrl on ApprovalResponseEmailDetails).
  playUrl: string;
  fallbackNote?: string;
};

function wouldPlayAgainLabel(v: string | null): string | null {
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  if (v === "with_reservations") return "With reservations";
  return null;
}

// Fires once, right after the artist (or their manager/rep) submits the
// public /settle/[token] form (see submitSettlement in
// app/actions/settlement.ts) -- mirrors sendApprovalResponseEmail's
// "close the loop back to the agent" role exactly, just for the settlement
// report instead of the approve/decline decision. Expenses and the
// promoter-notes/other-events text aren't repeated here -- those are
// informational detail best read in context on the play page itself,
// not reconstructed as a second copy in an email body.
export async function sendSettlementReceivedEmail(details: SettlementReceivedEmailDetails): Promise<void> {
  if (!resend) {
    console.warn(
      `RESEND_API_KEY is not set -- skipping settlement-received email (would have gone to: ${details.to})`
    );
    return;
  }

  const rows: [string, string][] = [
    ["Venue", details.venueLabel],
    ...(details.showDate ? ([["Date", details.showDate]] as [string, string][]) : []),
    ...(formatMoney(details.walkoutAmount)
      ? ([["Walkout", formatMoney(details.walkoutAmount) as string]] as [string, string][])
      : []),
    ...(formatMoney(details.grossMerchSales)
      ? ([["Gross merch sales", formatMoney(details.grossMerchSales) as string]] as [string, string][])
      : []),
    ...(wouldPlayAgainLabel(details.wouldPlayAgain)
      ? ([["Would play again", wouldPlayAgainLabel(details.wouldPlayAgain) as string]] as [string, string][])
      : []),
  ];

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #1a1a1a;">
      ${details.fallbackNote ? fallbackBanner(details.fallbackNote) : ""}
      <h2 style="margin-bottom: 4px;">Settlement report in: ${escapeHtml(details.artistName)} at ${escapeHtml(details.venueLabel)}</h2>
      <p style="color: #555;">The post-show report came back. Headline numbers below -- full detail (expenses, notes) is on the play in Base Camp.</p>
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
        View full report in Base Camp
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
      to: [details.to],
      subject: `Settlement report in: ${details.artistName} at ${details.venueLabel}`,
      html,
    });

    if (error) {
      console.error("Settlement-received email failed to send:", error);
      await logEmailFailure(
        "settlement_received",
        details.to,
        { artistName: details.artistName, venueLabel: details.venueLabel },
        JSON.stringify(error)
      );
    }
  } catch (err) {
    console.error("Settlement-received email threw while sending:", err);
    await logEmailFailure(
      "settlement_received",
      details.to,
      { artistName: details.artistName, venueLabel: details.venueLabel },
      err instanceof Error ? err.message : String(err)
    );
  }
}

export type CommissionInvoiceManagerNoticeDetails = {
  managerEmails: string[];
  artistName: string;
  venueLabel: string;
  showDate: string | null;
  amount: number;
  billingEmail: string;
};

// Replaces trying to CC management natively on the QuickBooks invoice
// itself (2026-11-12, first live test): QBO's Invoice create rejected
// BillEmailCc outright ("Property Name ... unsupported or invalid",
// ValidationFault) on the very first real call, which answers the
// "NEEDS LIVE VERIFICATION" question this plan had been carrying since
// the CC feature was built -- it doesn't survive at all, not even
// partially. Rather than keep fighting an undocumented/unsupported QBO
// property, management now gets a separate, plain FYI from Base Camp
// itself (same channel, same trust level as every other automated
// notification in this file) once the real invoice has actually gone
// out to the artist. Deliberately not the invoice or a payable
// document -- that stays exclusively QBO's own email to the artist (the
// artist is who's billed, per docs/operations-accounting-plan.md
// section 2 -- the manager is informed, not CC'd on the thing itself).
// Best-effort: called only after sendInvoice already succeeded
// (pushCommissionInvoiceRow), so a failure here never blocks or
// unwinds the invoice that already went out.
export async function sendCommissionInvoiceManagerNotice(
  details: CommissionInvoiceManagerNoticeDetails
): Promise<void> {
  if (details.managerEmails.length === 0) return;
  if (!resend) {
    console.warn(
      `RESEND_API_KEY is not set -- skipping commission-invoice manager notice (would have gone to: ${details.managerEmails.join(", ")})`
    );
    return;
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #1a1a1a;">
      <h2 style="margin-bottom: 4px;">Invoice sent: ${escapeHtml(details.artistName)}</h2>
      <p style="color: #555;">
        The Ridge Music Group just sent a booking-commission invoice to
        <strong>${escapeHtml(details.artistName)}</strong> (${escapeHtml(details.billingEmail)})
        ${details.showDate ? `for the ${escapeHtml(details.showDate)} show` : ""} at
        ${escapeHtml(details.venueLabel)} -- <strong>${escapeHtml(formatMoney(details.amount) ?? "")}</strong>.
        You're receiving this as their management contact on file; no action needed.
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        Sent automatically by Base Camp, The Ridge Music Group.
      </p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
      to: details.managerEmails,
      subject: `Invoice sent: ${details.artistName}${details.showDate ? ` (${details.showDate})` : ""}`,
      html,
    });

    if (error) {
      console.error("Commission-invoice manager notice failed to send:", error);
      await logEmailFailure(
        "commission_invoice_manager_notice",
        details.managerEmails.join(", "),
        { artistName: details.artistName, venueLabel: details.venueLabel },
        JSON.stringify(error)
      );
    }
  } catch (err) {
    console.error("Commission-invoice manager notice threw while sending:", err);
    await logEmailFailure(
      "commission_invoice_manager_notice",
      details.managerEmails.join(", "),
      { artistName: details.artistName, venueLabel: details.venueLabel },
      err instanceof Error ? err.message : String(err)
    );
  }
}
