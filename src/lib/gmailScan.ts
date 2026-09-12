import { google } from "googleapis";

// Weekly contact auto-discovery, Phase 1 -- see the "Base Camp -- Weekly
// Contact Auto-Discovery" plan. Scans Greg's and Justin's Gmail inboxes for
// email addresses that might be net-new contacts/venues worth adding to
// Base Camp, without ever reading message bodies or attachments.
//
// Auth: domain-wide delegation. A Google Cloud service account is
// authorized in the Workspace Admin Console to impersonate any mailbox in
// the theridgemusicgroup.com domain for the gmail.metadata scope (headers/
// labels/snippet only -- no body, no attachments). Each call below builds a
// fresh JWT client scoped to one mailbox via the `subject` field; nothing
// is cached across calls since this only ever runs once a week from the
// cron route.
const GMAIL_METADATA_SCOPE = "https://www.googleapis.com/auth/gmail.metadata";

type ServiceAccountKey = { client_email: string; private_key: string };

// Lazy, per-call-site env read (same pattern as apiKey() in
// lib/signature/signwell.ts) -- throws with an actionable message rather
// than failing silently, since this only ever runs server-side in the cron
// route where a thrown error is caught and logged, not shown to a user.
function serviceAccountCredentials(): ServiceAccountKey {
  const b64 = process.env.GMAIL_SERVICE_ACCOUNT_KEY;
  if (!b64) {
    throw new Error(
      "GMAIL_SERVICE_ACCOUNT_KEY is not set. Base64-encode the Google Cloud service account's JSON key (base64 -i key.json) and set it in the environment."
    );
  }

  let parsed: Partial<ServiceAccountKey>;
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    throw new Error(
      "GMAIL_SERVICE_ACCOUNT_KEY did not decode to valid JSON -- check it's the base64 of the raw key file, not the file path or an already-decoded value."
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GMAIL_SERVICE_ACCOUNT_KEY decoded but is missing client_email/private_key -- check the key file wasn't truncated when base64-encoding it."
    );
  }

  return parsed as ServiceAccountKey;
}

function gmailClientFor(mailbox: string) {
  const creds = serviceAccountCredentials();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [GMAIL_METADATA_SCOPE],
    subject: mailbox,
  });
  return google.gmail({ version: "v1", auth });
}

// Ridge's own domain is never a "new contact" -- filtered unconditionally,
// separate from domain_rules (Greg's own curated exclusion list, which
// lives in the database and is checked by the cron route, not here).
const RIDGE_DOMAIN = "theridgemusicgroup.com";

// Generic sender/system addresses that are never a real person to follow
// up with. This is a plain, hardcoded heuristic -- distinct from
// domain_rules, which Greg grows over time for domains specific to Ridge's
// own inbox noise (a particular vendor, a particular mailing list, etc).
export const NOISE_DOMAIN_DENYLIST = [
  "docusign.net",
  "docusign.com",
  "calendly.com",
  "zoom.us",
  "google.com",
  "accounts.google.com",
  "linkedin.com",
  "facebookmail.com",
  "stripe.com",
  "quickbooks.com",
  "mailchimp.com",
  "sendgrid.net",
];

const NOISE_LOCAL_PART_RE =
  /^(no[-.]?reply|noreply|do[-.]?not[-.]?reply|notifications?|mailer-daemon|postmaster|calendar|invite|bounce|alerts?|updates?|digest|newsletter|support|help|info|hello|contact|billing|receipts?|automated|system|admin|webmaster|feedback)$/i;

function isNoiseAddress(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return true;
  const domain = email.slice(at + 1).toLowerCase();
  if (domain === RIDGE_DOMAIN) return true;
  if (NOISE_DOMAIN_DENYLIST.includes(domain)) return true;
  // Strip a "+tag" before checking the local part so "noreply+123@x.com"
  // is still caught.
  const localPart = email.slice(0, at).split("+")[0];
  return NOISE_LOCAL_PART_RE.test(localPart);
}

// Deliberately simple, not RFC-5322-complete -- good enough for real
// From/To/Cc header values, which are what Gmail actually sends back.
// First pulls out "Display Name <email>" pairs, then whatever bare
// addresses are left in what wasn't consumed by that pass.
function parseAddressList(headerValue: string): { email: string; name: string | null }[] {
  const results: { email: string; name: string | null }[] = [];
  const bracketRe = /"?([^"<,]*)"?\s*<([^<>\s]+@[^<>\s]+)>/g;
  let remaining = headerValue;
  let match: RegExpExecArray | null;
  while ((match = bracketRe.exec(headerValue)) !== null) {
    const name = match[1]?.trim();
    const email = match[2].trim();
    results.push({ email, name: name ? name : null });
    remaining = remaining.replace(match[0], "");
  }

  const bareRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  let bareMatch: RegExpExecArray | null;
  while ((bareMatch = bareRe.exec(remaining)) !== null) {
    results.push({ email: bareMatch[0], name: null });
  }

  return results;
}

export type ScanSource = "greg" | "justin";

export type ScannedCandidate = {
  email: string;
  inferredName: string | null;
  source: ScanSource;
  // The Gmail message id an address was (first) seen on, kept purely for
  // manual debugging -- not surfaced anywhere in the digest.
  sourceMessageRef: string | null;
};

// Lists messages from the last `lookbackDays` (default 8 -- a 7-day cadence
// plus a 1-day overlap buffer) and reads only their From/To/Cc/Subject/Date
// headers -- never a body or attachment. Overlap is safe because re-seeing
// an address just bumps candidates.times_seen in the cron route; it never
// re-triggers a digest entry or duplicates a row. The cron route exposes a
// `?days=` override so a first manual run can use a short window instead of
// dumping a whole backlog into one digest -- see the route for details.
//
// `lookbackDays: 0` means unbounded -- no `newer_than` filter at all, i.e.
// the entire mailbox. This is meant for a one-time full-history backfill
// (Greg wants the first run to capture everything, not just the last
// week), NOT for routine invocation: see the cron route's own comment on
// why that backfill should run outside the deployed serverless function.
export async function scanMailbox(
  mailbox: string,
  source: ScanSource,
  lookbackDays = 8
): Promise<ScannedCandidate[]> {
  const gmail = gmailClientFor(mailbox);

  const messageIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await gmail.users.messages.list({
      userId: "me",
      ...(lookbackDays > 0 ? { q: `newer_than:${lookbackDays}d` } : {}),
      pageToken,
      maxResults: 500,
    });
    for (const m of data.messages ?? []) {
      if (m.id) messageIds.push(m.id);
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  const found = new Map<string, ScannedCandidate>();

  for (const id of messageIds) {
    const { data: msg } = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
    });

    const headers = msg.payload?.headers ?? [];
    const headerValue = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

    for (const headerVal of [headerValue("From"), headerValue("To"), headerValue("Cc")]) {
      if (!headerVal) continue;
      for (const { email, name } of parseAddressList(headerVal)) {
        const normalized = email.toLowerCase();
        if (isNoiseAddress(normalized)) continue;

        const existing = found.get(normalized);
        if (existing) {
          if (!existing.inferredName && name) existing.inferredName = name;
        } else {
          found.set(normalized, {
            email: normalized,
            inferredName: name,
            source,
            sourceMessageRef: id,
          });
        }
      }
    }
  }

  return Array.from(found.values());
}
