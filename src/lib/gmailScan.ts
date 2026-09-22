import { google } from "googleapis";

// Weekly contact auto-discovery, Phase 1+2 -- see the "Base Camp -- Weekly
// Contact Auto-Discovery" and "Richer candidate signals" plans. Scans
// Greg's and Justin's Gmail inboxes for email addresses that might be
// net-new contacts/venues worth adding to Base Camp, and now also reads
// message bodies (subject line + top of message, quoted history excluded)
// to infer a greeting-line name, a phone number, and context for the
// review UI.
//
// Auth: domain-wide delegation. A Google Cloud service account is
// authorized in the Workspace Admin Console to impersonate any mailbox in
// the theridgemusicgroup.com domain for the gmail.readonly scope (was
// gmail.metadata -- upgraded so body content can be read; Greg approved
// this trade-off explicitly and re-authorized the scope in Workspace
// Admin). Each call below builds a fresh JWT client scoped to one mailbox
// via the `subject` field; nothing is cached across calls since this only
// ever runs once a week from the cron route.
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

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
    scopes: [GMAIL_READONLY_SCOPE],
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

// Greg's own addresses that aren't @theridgemusicgroup.com -- never a new
// contact either, same reasoning as RIDGE_DOMAIN above, just for the one
// or two specific personal addresses rather than a whole domain (a
// personal Gmail/Yahoo address can't be denylisted by domain the way a
// company's can -- it's shared with millions of real prospects).
const KNOWN_PERSONAL_EMAILS = new Set([
  "greg.burroughs@yahoo.com",
  "justinmayottephoto@gmail.com",
]);

function isNoiseAddress(email: string): boolean {
  if (KNOWN_PERSONAL_EMAILS.has(email)) return true;
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

// -- Body extraction -----------------------------------------------------
//
// Everything below is new with the gmail.readonly upgrade: pulling a
// plain-text version of the message body out of Gmail's MIME structure,
// trimming it down to just the "new" content above any quoted thread
// history, and running two small heuristics over that trimmed text. None
// of this needs a new dependency -- Gmail already hands back the MIME tree
// in `messages.get(..., format: "full")`.

type GmailPart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; size?: number | null } | null;
  parts?: GmailPart[] | null;
};

// Large parts (a big attachment, an embedded image) are skipped outright --
// this is only ever looking for ordinary message text.
const MAX_PART_BYTES = 200_000;

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Recursively walks the MIME tree for the first text/plain part, falling
// back to text/html (tags stripped) if no plain-text part exists. Any part
// with a `filename` is an attachment and is skipped, not walked into.
function extractBodyText(payload: GmailPart | null | undefined): string {
  if (!payload) return "";

  let plainFound: string | null = null;
  let htmlFound: string | null = null;

  function walk(part: GmailPart) {
    if (part.filename) return;
    const size = part.body?.size ?? 0;
    if (plainFound === null && part.mimeType === "text/plain" && part.body?.data && size <= MAX_PART_BYTES) {
      plainFound = decodeBase64Url(part.body.data);
      return;
    }
    if (htmlFound === null && part.mimeType === "text/html" && part.body?.data && size <= MAX_PART_BYTES) {
      htmlFound = decodeBase64Url(part.body.data);
      return;
    }
    for (const child of part.parts ?? []) walk(child);
  }

  walk(payload);
  if (plainFound !== null) return plainFound;
  if (htmlFound !== null) return stripHtml(htmlFound);
  return "";
}

// Cuts a message body down to just the newly-written content, dropping
// everything from the first quoted-history marker onward (Gmail's "On ...
// wrote:", Outlook's "-----Original Message-----", or a "> " blockquote
// line). This is what both extraction heuristics below run against, and
// what gets stored as reviewer context -- neither should ever see the tail
// of a long reply chain.
const QUOTE_MARKER_RE = /(^On .+ wrote:\s*$)|(^-{2,}\s*Original Message\s*-{2,}$)|(^>.*$)/im;

function newContentOnly(text: string): string {
  const match = QUOTE_MARKER_RE.exec(text);
  return (match ? text.slice(0, match.index) : text).trim();
}

// A greeting near the top of the new content ("Hi Mark," / "Dear Sarah,")
// -- only meaningful for an OUTBOUND message (Ridge addressing someone by
// name), so this is only invoked that way by the caller below. Scoped to
// the first ~300 chars so it can't match a name inside the message body
// itself, just the salutation line.
function extractGreetingName(text: string): string | null {
  const m = /^\s*(?:hi|hello|hey|dear)[,]?\s+([A-Z][a-zA-Z'’-]{1,20})\b/im.exec(
    text.slice(0, 300)
  );
  return m ? m[1] : null;
}

// A plain US phone number pattern, run over the same new-content text --
// catches a number left in a signature block at the bottom of a reply as
// readily as one mentioned inline.
const PHONE_RE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/;

function extractPhone(text: string): string | null {
  const m = PHONE_RE.exec(text);
  return m ? m[0].trim() : null;
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
  inferredPhone: string | null;
  // Subject and a trimmed body excerpt from the message the candidate was
  // first seen on -- reviewer context in the candidates UI, and the raw
  // material the cron route's venue/event name-mention matching runs
  // against. Never the full message; bodySnippet is already capped to the
  // pre-quote "new content" only (see newContentOnly above).
  subject: string | null;
  bodySnippet: string | null;
  source: ScanSource;
  // The Gmail message id an address was (first) seen on, kept purely for
  // manual debugging -- not surfaced anywhere in the digest.
  sourceMessageRef: string | null;
};

// Lists messages from the last `lookbackDays` (default 8 -- a 7-day cadence
// plus a 1-day overlap buffer), reading From/To/Cc/Subject/Date headers
// plus (since the gmail.readonly upgrade) the message body -- trimmed down
// to subject + the pre-quote "new content" only, see newContentOnly.
// Overlap is safe because re-seeing an address just bumps
// candidates.times_seen in the cron route; it never re-triggers a digest
// entry or duplicates a row. The cron route exposes a `?days=` override so
// a first manual run can use a short window instead of dumping a whole
// backlog into one digest -- see the route for details.
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

  // The metadata scope this used to run under didn't support the `q`
  // search parameter at all -- Google rejected it outright with a 403
  // "Metadata scope does not support 'q' parameter". gmail.readonly does
  // support `q`, but there's no need to reintroduce server-side date
  // filtering now that this already works correctly client-side (and
  // changing it back would be pure risk for no benefit) -- every list call
  // still fetches the full message id list, and the lookbackDays cutoff
  // below is still applied client-side against each message's own Date
  // header.
  const messageIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await gmail.users.messages.list({
      userId: "me",
      pageToken,
      maxResults: 500,
    });
    for (const m of data.messages ?? []) {
      if (m.id) messageIds.push(m.id);
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  const found = new Map<string, ScannedCandidate>();
  const cutoff = lookbackDays > 0 ? Date.now() - lookbackDays * 24 * 60 * 60 * 1000 : null;

  for (const id of messageIds) {
    const { data: msg } = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });

    const headers = msg.payload?.headers ?? [];
    const headerValue = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

    if (cutoff !== null) {
      const messageDate = new Date(headerValue("Date"));
      if (Number.isNaN(messageDate.getTime()) || messageDate.getTime() < cutoff) {
        continue;
      }
    }

    const subjectHeader = headerValue("Subject") || null;
    const newContent = newContentOnly(extractBodyText(msg.payload as GmailPart | undefined));
    const bodySnippet = newContent ? newContent.slice(0, 500) : null;

    // A greeting name and a signature-block phone number are only
    // attributable to a specific candidate when exactly one external
    // (non-Ridge, non-noise) address is involved in the message -- with
    // more than one, there's no way to tell who "Hi Mark," or a phone
    // number in the body actually belongs to, so both are skipped rather
    // than guessed.
    const externalEmails = new Set<string>();
    for (const headerVal of [headerValue("From"), headerValue("To"), headerValue("Cc")]) {
      if (!headerVal) continue;
      for (const { email } of parseAddressList(headerVal)) {
        const normalized = email.toLowerCase();
        if (!isNoiseAddress(normalized)) externalEmails.add(normalized);
      }
    }
    const singleExternal = externalEmails.size === 1 ? [...externalEmails][0] : null;

    const fromEmail = parseAddressList(headerValue("From"))[0]?.email?.toLowerCase() ?? "";
    const outbound = fromEmail.endsWith(`@${RIDGE_DOMAIN}`);

    const greetingName = singleExternal && outbound ? extractGreetingName(newContent) : null;
    // Only from an INBOUND message -- a phone number in the body of an
    // OUTBOUND message (Greg or Justin writing) is Greg's or Justin's own
    // signature, not the external recipient's, and attaching it to the
    // recipient's candidate row would be wrong. (Confirmed in practice:
    // the same number showed up attached to two unrelated venue contacts
    // who'd both received the same outbound message.) Only a number the
    // external person wrote themselves, in a message they authored, is
    // plausibly theirs.
    const phone = singleExternal && !outbound ? extractPhone(newContent) : null;

    for (const headerVal of [headerValue("From"), headerValue("To"), headerValue("Cc")]) {
      if (!headerVal) continue;
      for (const { email, name } of parseAddressList(headerVal)) {
        const normalized = email.toLowerCase();
        if (isNoiseAddress(normalized)) continue;

        const isSingleExternal = normalized === singleExternal;
        const existing = found.get(normalized);
        if (existing) {
          if (!existing.inferredName && name) existing.inferredName = name;
          if (!existing.inferredName && isSingleExternal && greetingName) {
            existing.inferredName = greetingName;
          }
          if (!existing.inferredPhone && isSingleExternal && phone) {
            existing.inferredPhone = phone;
          }
        } else {
          found.set(normalized, {
            email: normalized,
            inferredName: name ?? (isSingleExternal ? greetingName : null),
            inferredPhone: isSingleExternal ? phone : null,
            subject: subjectHeader,
            bodySnippet,
            source,
            sourceMessageRef: id,
          });
        }
      }
    }
  }

  return Array.from(found.values());
}
