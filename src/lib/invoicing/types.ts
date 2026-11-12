// The seam that makes the invoicing provider swappable -- same pattern as
// src/lib/signature/types.ts, same reasoning: everything in the rest of
// the app (wherever "create a commission invoice" gets triggered from,
// the webhook route) talks to this interface, never to a provider's
// SDK/REST API directly. That's confined to one file per provider (see
// quickbooks.ts). Swapping providers later means writing a new file that
// implements this interface and flipping INVOICING_PROVIDER, not touching
// call sites.
//
// Scope is deliberately narrow, per docs/operations-accounting-plan.md
// section 7: create an invoice for one artist's commission on one play,
// fetch its current state, and turn a raw webhook body into a normalized
// event. Matching/creating the QBO Customer behind an invoice is an
// implementation detail of createInvoice, not a separate interface method
// -- callers never need to know a Customer object exists at all.

export type InvoiceRecipient = {
  /** Billing name -- the artist's legal entity if one's on file, their
   *  stage name otherwise. See buildContractMergeData's identical
   *  fallback for artist_legal_entity. */
  name: string;
  email: string;
};

export type CreateInvoiceInput = {
  /** Cached QBO Customer id for this artist, if createInvoice has already
   *  matched/created one before (see artists.qbo_customer_id). Null the
   *  first time -- the provider is responsible for creating the Customer
   *  and the caller is responsible for persisting the id it returns so
   *  this is never null again for the same artist. */
  existingProviderCustomerId: string | null;
  customer: InvoiceRecipient;
  /** Management-role contact email(s), if any are on file -- CC'd on the
   *  invoice so they're on copy alongside the artist (Greg, 2026-11-12:
   *  "let's add artist and management to the invoice send so multiple
   *  people are on copy"). More than one management contact (e.g. a duo
   *  of managers) is passed as a single comma-separated string -- QBO's
   *  Cc field takes multiple addresses the same way its own "Send" dialog
   *  does. Optional and best-effort: an artist with no management
   *  contact on file still gets invoiced normally, just without a CC.
   *  NEEDS LIVE VERIFICATION (see this file's own header note, and
   *  quickbooks.ts's createInvoice) -- QBO's BillEmailCc field is
   *  documented, but whether it survives alongside the later
   *  /send?sendTo= call hasn't been confirmed against a real send yet. */
  ccEmail?: string | null;
  /** What shows up on the invoice line -- e.g. "Booking commission --
   *  Cody Webb at Eudora Wildlife Safari Park, 11/1/2026". */
  description: string;
  amount: number;
};

export type CreateInvoiceResult = {
  providerInvoiceId: string;
  /** Echoed back so the caller can persist it onto the artist even when
   *  existingProviderCustomerId was already set (a no-op write in that
   *  case, but simpler than two different result shapes). */
  providerCustomerId: string;
};

export type InvoiceState = {
  /** QBO's own Balance field -- 0 once fully paid. This, not a status
   *  enum, is the actual source of truth for "is this paid" (see
   *  getInvoice's doc comment). */
  balance: number;
  totalAmount: number;
  /** True once balance reaches 0. Computed by the provider, not left to
   *  the caller, since "paid" could in principle mean something slightly
   *  different per provider (e.g. a voided invoice might also show a zero
   *  balance). */
  paid: boolean;
  voided: boolean;
};

export type NormalizedInvoiceEventType =
  | "invoice_changed"
  | "payment_received"
  | "unknown";

export type NormalizedInvoiceEvent = {
  type: NormalizedInvoiceEventType;
  /** QBO's webhook payload is entity-change notifications, not invoice ids
   *  directly -- for a Payment event this is the Payment's id, not an
   *  Invoice id. Either way, resolving "is a specific invoice now paid"
   *  requires a follow-up getInvoice call keyed by *our own*
   *  provider_invoice_id, matched separately -- see the webhook route. */
  entityName: string;
  entityId: string;
  /** The raw, unmodified payload -- always stored into
   *  commission_invoices.provider_events for audit/debugging, same
   *  reasoning as NormalizedSignatureEvent.raw. */
  raw: unknown;
};

export interface InvoicingProvider {
  readonly name: string;

  createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult>;

  /** Hands the invoice to the provider's own send pipeline -- this is what
   *  actually puts it in front of the customer (an emailed invoice with a
   *  pay-online link, QBO's own template), same "provider owns sending"
   *  split as the rest of docs/operations-accounting-plan.md section 2.
   *  createInvoice alone only creates the object provider-side; a caller
   *  must call this too before commission_invoices.sent_at is set. Kept as
   *  its own step (not folded into createInvoice) so a send failure after
   *  a successful create is a retryable gap, not a half-done invoice. */
  sendInvoice(providerInvoiceId: string, email: string): Promise<void>;

  /** Fetch an invoice's current state by the provider's own id. This is
   *  the only reliable way to know if an invoice has actually been paid --
   *  QBO's webhook payload is thin (entity name/id/operation/timestamp,
   *  no field-level detail), so every webhook that might mean "paid" is
   *  resolved by calling this, never by trusting the webhook body alone.
   *  See docs/operations-accounting-plan.md section 2. */
  getInvoice(providerInvoiceId: string): Promise<InvoiceState>;

  /** Verify the request actually came from the provider before any of its
   *  contents are trusted. Must be called before parseWebhookEvent. */
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;

  /** A single webhook delivery can bundle several entity-change
   *  notifications -- unlike SignatureProvider's parseWebhookEvent (one
   *  event per call), this returns all of them from one payload. */
  parseWebhookEvents(rawBody: string): NormalizedInvoiceEvent[];
}
