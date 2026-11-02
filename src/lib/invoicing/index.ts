import { QuickBooksProvider } from "./quickbooks";
import type { InvoicingProvider } from "./types";

export type {
  InvoicingProvider,
  CreateInvoiceInput,
  CreateInvoiceResult,
  InvoiceState,
  InvoiceRecipient,
  NormalizedInvoiceEvent,
  NormalizedInvoiceEventType,
} from "./types";

// The one place that picks a concrete provider. Everything else in the
// app calls getInvoicingProvider() and codes against the InvoicingProvider
// interface -- same pattern as getSignatureProvider() in lib/signature.
export function getInvoicingProvider(): InvoicingProvider {
  const provider = process.env.INVOICING_PROVIDER ?? "quickbooks";
  switch (provider) {
    case "quickbooks":
      return new QuickBooksProvider();
    default:
      throw new Error(`Unknown INVOICING_PROVIDER "${provider}".`);
  }
}
