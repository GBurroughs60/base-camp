import { Resend } from "resend";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";

// Same lazy-construction pattern as approvalEmail.ts/contactDigestEmail.ts/
// eventsNeedingAttentionEmail.ts -- there's no shared src/lib/email wrapper
// in this project (see each of those files' own identical copy of this
// line), so this is its own copy rather than a new shared module, matching
// what's already here instead of introducing a different pattern for one
// more email.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type InviteEmailDetails = {
  to: string;
  /** The display name (or email, as a fallback) of the admin who sent the
   * invite -- shown in the email body so the recipient knows who to ask
   * if the invite looks unexpected. */
  invitedByName: string;
  /** Built by inviteTeamMember from generateLink's hashed_token --
   * /auth/confirm?token_hash=...&type=invite&next=/invite/set-password --
   * never Supabase's own action_link, since Greg chose a custom Base Camp
   * email over Supabase's built-in invite email (2026-11-09). One-time use:
   * if this link is already spent, "Resend invite" generates a fresh one
   * rather than this same link working twice. */
  inviteUrl: string;
};

// Sent once, the moment an admin invites a new Base Camp account (see
// inviteTeamMember in app/actions/userProfiles.ts), and again from
// "Resend invite" on the Team page if the first one goes stale/unused.
// Unlike every other email in this app, failure here is surfaced straight
// back to the admin who clicked the button (inviteTeamMember's return
// value), not through the email_notification_failures/alertGreg path
// those use -- those exist because *nobody is watching* when a cron or
// webhook email fails; here, the admin is sitting right there watching
// the Team page respond, so a synchronous error is strictly more useful
// than a row in a table and a follow-up email days later.
export async function sendInviteEmail(details: InviteEmailDetails): Promise<void> {
  if (!resend) {
    throw new Error(
      "RESEND_API_KEY is not set -- can't send the invite email (would have gone to: " + details.to + ")"
    );
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Base Camp <onboarding@resend.dev>",
    to: [details.to],
    subject: "You've been invited to Base Camp",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; color: #1a1a1a;">
        <p>${escapeHtml(details.invitedByName)} invited you to Base Camp, Ridge Music Group's
        internal operations tool.</p>
        <p style="margin: 20px 0;">
          <a href="${details.inviteUrl}"
             style="display: inline-block; background: #d9622b; color: #fff; text-decoration: none;
                    padding: 10px 20px; border-radius: 6px; font-weight: 600;">
            Set up your account
          </a>
        </p>
        <p style="color: #777; font-size: 13px;">
          This link is one-time use and gets you straight to choosing a password -- no separate
          invite code needed. If it's expired by the time you click it, ask
          ${escapeHtml(details.invitedByName)} to resend it from Base Camp's Team page.
        </p>
        <p style="color: #999; font-size: 12px; margin-top: 16px;">
          Sent automatically by Base Camp. If you weren't expecting this,
          you can ignore it -- no account is created until that link is used.
        </p>
      </div>
    `,
    // Mirrors FALLBACK_NOTIFY_EMAIL's role elsewhere: if the invite bounces
    // or lands wrong, the sender should hear about it directly rather than
    // it silently vanishing into the recipient's spam folder with no admin
    // any the wiser.
    replyTo: FALLBACK_NOTIFY_EMAIL,
  });
}
