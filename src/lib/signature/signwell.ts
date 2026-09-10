import type {
  NormalizedSignatureEvent,
  SendForSignatureInput,
  SendForSignatureResult,
  SignatureProvider,
  SignatureSignerRole,
} from "./types";
import crypto from "node:crypto";

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
        // Fields are placed via SignWell "text tags" embedded (invisibly --
        // white-on-white) in the contract template's own Section 11
        // Signature/Date cells -- see purchaser_signature_tag /
        // artist_rep_signature_tag etc. in buildContractMergeData. This
        // replaced an earlier attempt using `with_signature_page: true`,
        // which was meant to let SignWell auto-place its own signature
        // page without us having to pin exact pixel coordinates on a
        // .docx that's regenerated fresh from live data every time (so
        // there's no fixed layout to target). That flag did not work in
        // practice: a live QA send with it left the document permanently
        // stuck in a non-standard "Sending" status, never reaching "Sent",
        // with the document's own field checklist confirming no fields
        // had actually been placed for either recipient. Text tags don't
        // have that problem since they ride along with the contract's
        // real content regardless of how the page layout shifts.
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
    // NEEDS LIVE VERIFICATION: the per-recipient status field inside
    // data.recipients[] (used here as a best-effort fallback) isn't fully
    // pinned down by the public docs -- the primary signal this relies on
    // is event.type plus event.related_signer_id, which are documented.
    const parsed = JSON.parse(rawBody) as {
      event?: { type?: string; related_signer_id?: string; related_recipient_id?: string };
      data?: { id?: string };
    };

    const rawType = parsed.event?.type ?? "";
    const providerDocumentId = parsed.data?.id ?? "";
    const recipientId =
      parsed.event?.related_signer_id ?? parsed.event?.related_recipient_id ?? null;

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
