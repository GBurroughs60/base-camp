import type {
  NormalizedSignatureEvent,
  SendForSignatureInput,
  SendForSignatureResult,
  SignatureProvider,
  SignatureSignerRole,
} from "./types";
import crypto from "node:crypto";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";

const API_BASE = "https://www.signwell.com/api/v1";

// A few specifics below are marked NEEDS LIVE VERIFICATION -- they're the
// best answer SignWell's public docs give, but the docs are thin/summarized
// in places and occasionally inconsistent between pages (e.g. the completed
// PDF endpoint appears as both `/documents/{id}/completed_pdf` and
// `/documents/{id}/pdf` on different reference pages). None of this is
// guessed outright -- everything here traces to a specific documented
// field -- but this adapter has not yet been run against a real account
// (that's the last item in the e-signature build: an end-to-end QA pass
// once there's a real SignWell API key). Treat this file as "should be
// right" rather than "confirmed right" until that pass has run.
function apiKey(): string {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) {
    throw new Error(
      "SIGNWELL_API_KEY is not set. Create a SignWell account and API key, then set it in the environment."
    );
  }
  return key;
}

async function signwellFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": apiKey(),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  return res;
}

type CreateDocumentRecipient = { id: string; name: string; email: string };

// NEEDS LIVE VERIFICATION: exact shape of a successful create-document
// response. Documented fields are id/status/recipients; recipient objects
// are expected to echo back the `id` we assigned when creating them (that's
// how we map role -> provider recipient id below), but the response could
// use a different key (e.g. a provider-generated id distinct from the one
// we sent) -- if so, this mapping will need to switch to matching by email
// instead of by our own id.
type CreateDocumentResponse = {
  id: string;
  status?: string;
  recipients?: { id: string; email?: string }[];
};

export class SignWellProvider implements SignatureProvider {
  readonly name = "signwell";

  async sendForSignature(input: SendForSignatureInput): Promise<SendForSignatureResult> {
    const artist = input.signers.find((s) => s.role === "artist");
    const buyer = input.signers.find((s) => s.role === "buyer");
    if (!artist || !buyer) {
      throw new Error("sendForSignature requires both an artist and a buyer signer.");
    }

    // Buyer signs first, then the artist rep/manager countersigns second
    // (Greg's explicit call -- not the earlier assumption that the artist
    // side went first). apply_signing_order below means SignWell won't
    // even notify the second recipient until the first has signed, so this
    // array order is the actual signing order, not just a display order.
    const recipients: CreateDocumentRecipient[] = [
      { id: "buyer", name: buyer.name, email: buyer.email },
      { id: "artist", name: artist.name, email: artist.email },
    ];

    const res = await signwellFetch("/documents", {
      method: "POST",
      body: JSON.stringify({
        test_mode: input.testMode,
        draft: false,
        name: input.documentTitle,
        files: [{ name: input.fileName, file_base64: input.fileBase64 }],
        recipients,
        apply_signing_order: true,
        // Ridge wants visibility into every contract's signing progress
        // without that being tied to whichever email the SignWell account
        // itself logs in as (deliberately kept on Greg's personal address --
        // see the account's own Profile settings). copied_contacts is
        // SignWell's mechanism for exactly this: a non-signing recipient who
        // gets the account's own notification emails (sent/viewed/completed
        // -- each toggle lives on the SignWell account's Profile page, all
        // left at their default "Yes") plus the final signed document,
        // without being added as a signer or shown in the signature block.
        copied_contacts: [{ name: "Greg Burroughs", email: FALLBACK_NOTIFY_EMAIL }],
        // Fields are placed via SignWell "text tags" embedded (invisibly --
        // white-on-white) in the contract template's own Section 11
        // Signature/Date cells -- see purchaser_signature_tag /
        // artist_rep_signature_tag etc. in buildContractMergeData. Chosen
        // over pinning exact pixel coordinates via `fields` (the .docx is
        // regenerated fresh from live data every time, so there's no fixed
        // layout to target) and over `with_signature_page` (a live QA send
        // with that flag left the document sitting in an unusual "Sending"
        // status noticeably longer than a normal send, with no confirmed
        // way to verify fields had actually been placed).
        //
        // text_tags defaults to false -- without explicitly setting it,
        // SignWell doesn't scan the file for tags at all, and a `false`
        // create-document call with no `fields` and no `with_signature_page`
        // is rejected outright: a live test confirmed the exact error
        // (422, recipients.with_no_fields: "These recipients have no fields
        // associated: [buyer, artist]"), which is what sent us digging for
        // this flag in the first place.
        text_tags: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SignWell create-document failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as CreateDocumentResponse;
    const byId = new Map((data.recipients ?? []).map((r) => [r.id, r]));
    const artistRecipient = byId.get("artist");
    const buyerRecipient = byId.get("buyer");
    if (!artistRecipient || !buyerRecipient) {
      throw new Error(
        "SignWell create-document response didn't echo back both recipient ids -- check the response shape against sendForSignature's expectations."
      );
    }

    const recipientIdByRole: Record<SignatureSignerRole, string> = {
      artist: artistRecipient.id,
      buyer: buyerRecipient.id,
    };

    return { providerDocumentId: data.id, recipientIdByRole };
  }

  async voidRequest(providerDocumentId: string): Promise<void> {
    // NEEDS LIVE VERIFICATION: SignWell's documented API surface has
    // DELETE /documents/{id} but no endpoint specifically named
    // void/cancel -- their help docs only describe cancelling a document
    // from the web UI. Using delete here on the assumption it has the same
    // effect (stops the outstanding request) for a not-yet-completed
    // document. Only ever call this while status is 'sent' or
    // 'partially_signed' -- never after 'completed'.
    const res = await signwellFetch(`/documents/${providerDocumentId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SignWell void (delete document) failed (${res.status}): ${body}`);
    }
  }

  verifyWebhookSignature(rawBody: string): boolean {
    // SignWell's hash isn't an HMAC over the raw request body -- it's an
    // HMAC-SHA256 of `${event.type}@${event.time}`, keyed by the webhook's
    // own id (not the API key), with the result compared against
    // event.hash. See developers.signwell.com/reference/event-hash-verification.
    const secret = process.env.SIGNWELL_WEBHOOK_ID;
    if (!secret) {
      throw new Error("SIGNWELL_WEBHOOK_ID is not set -- cannot verify webhook authenticity.");
    }

    let parsed: { event?: { type?: string; time?: number | string; hash?: string } };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return false;
    }

    const event = parsed.event;
    if (!event?.type || event.time === undefined || !event.hash) return false;

    const data = `${event.type}@${event.time}`;
    const expected = crypto.createHmac("sha256", secret).update(data).digest("hex");

    const receivedBuf = Buffer.from(event.hash, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (receivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  }

  parseWebhookEvent(rawBody: string): NormalizedSignatureEvent {
    // Confirmed against developers.signwell.com/reference/event-data (the
    // "NEEDS LIVE VERIFICATION" guess this replaced had both of these
    // wrong, caught by a post-fix regression send: real events never fired
    // a recipientId match, silently no-op'ing every webhook after the
    // middleware fix let them through at all):
    //
    //  - The document id is at data.object.id, not data.id -- every event
    //    was logging "no contract_signatures row for provider_document_id="
    //    (empty) because parsed.data.id doesn't exist.
    //  - There is no related_signer_id/related_recipient_id field at all.
    //    SignWell identifies the signer by related_signer.email (or
    //    related_recipient.email/.id for SMS-specific events) -- getting
    //    back to *our* recipient id ("artist"/"buyer", assigned in
    //    sendForSignature) means cross-referencing that email against
    //    data.object.recipients[], which echoes the id we originally sent.
    const parsed = JSON.parse(rawBody) as {
      event?: {
        type?: string;
        related_signer?: { email?: string };
        related_recipient?: { id?: string; email?: string };
      };
      data?: { object?: { id?: string; recipients?: { id?: string; email?: string }[] } };
    };

    const rawType = parsed.event?.type ?? "";
    const providerDocumentId = parsed.data?.object?.id ?? "";
    const relatedEmail =
      parsed.event?.related_signer?.email ?? parsed.event?.related_recipient?.email ?? null;
    const recipients = parsed.data?.object?.recipients ?? [];
    const recipientId =
      (relatedEmail ? recipients.find((r) => r.email === relatedEmail)?.id : undefined) ??
      parsed.event?.related_recipient?.id ??
      null;

    const typeMap: Record<string, NormalizedSignatureEvent["type"]> = {
      document_sent: "sent",
      document_viewed: "viewed",
      document_signed: "signer_completed",
      document_completed: "completed",
      document_declined: "declined",
    };

    return {
      type: typeMap[rawType] ?? "unknown",
      providerDocumentId,
      recipientId,
      // SignWell's completed-document webhook is not documented to inline
      // the signed PDF -- the webhook handler should fall back to GET
      // /documents/{id}/completed_pdf when this is null, which it will be
      // in practice today.
      signedDocumentBase64: null,
      raw: parsed,
    };
  }
}
