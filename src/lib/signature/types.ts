// The seam that makes the e-signature provider swappable. Everything in the
// rest of the app (the Contract Review screen's send/void actions, the
// webhook route) talks to this interface, never to a provider's SDK or REST
// API directly -- that's confined to one file per provider (see
// signwell.ts). Swapping providers later (different pricing, different
// scale, a provider that better fits multi-artist volume) means writing a
// new file that implements this interface and flipping SIGNATURE_PROVIDER,
// not touching call sites.
//
// Scope is deliberately narrow: send a document to exactly two named
// signers (artist rep, buyer), void a request, and turn a raw webhook body
// into a normalized event. It does not try to model every feature a given
// provider offers (templates, embedded signing, SMS delivery, etc.) --
// those can be added to the interface later if a real need shows up.

export type SignatureSignerRole = "artist" | "buyer";

export type SignatureSigner = {
  role: SignatureSignerRole;
  name: string;
  email: string;
};

export type SendForSignatureInput = {
  /** Base64-encoded file content (the generated contract .docx). */
  fileBase64: string;
  fileName: string;
  documentTitle: string;
  signers: SignatureSigner[];
  /** When true, use the provider's non-binding test/sandbox mode. */
  testMode: boolean;
};

export type SendForSignatureResult = {
  providerDocumentId: string;
  /** Provider-assigned id for each signer, keyed by role -- needed to match
   *  later per-signer webhook events back to artist vs. buyer. */
  recipientIdByRole: Record<SignatureSignerRole, string>;
};

export type NormalizedSignatureEventType =
  | "sent"
  | "viewed"
  | "signer_completed"
  | "completed"
  | "declined"
  | "unknown";

export type NormalizedSignatureEvent = {
  type: NormalizedSignatureEventType;
  providerDocumentId: string;
  /** Which signer this specific event is about, when the event is
   *  signer-scoped (viewed/signer_completed/declined). Null for
   *  document-level events (completed) or when the provider payload didn't
   *  include enough to tell. */
  recipientId: string | null;
  /** Present only on a "completed" event, when the provider includes the
   *  final signed document inline (base64) rather than requiring a
   *  follow-up download call. */
  signedDocumentBase64: string | null;
  /** The raw, unmodified payload -- always stored into
   *  contract_signatures.provider_events for audit/debugging, since this is
   *  a provider integration we don't control the shape of. */
  raw: unknown;
};

export interface SignatureProvider {
  readonly name: string;

  sendForSignature(input: SendForSignatureInput): Promise<SendForSignatureResult>;

  /** Cancel an outstanding (not yet completed) signature request. Providers
   *  generally reject voiding a request that's already fully signed --
   *  callers should only invoke this while status is 'sent' or
   *  'partially_signed'. */
  voidRequest(providerDocumentId: string): Promise<void>;

  /** Verify the request actually came from the provider (HMAC/signature
   *  check against the raw body) before any of its contents are trusted.
   *  Must be called before parseWebhookEvent. */
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;

  parseWebhookEvent(rawBody: string): NormalizedSignatureEvent;
}
