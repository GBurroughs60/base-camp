import { SignWellProvider } from "./signwell";
import type { SignatureProvider } from "./types";

export type { SignatureProvider, SignatureSigner, SignatureSignerRole } from "./types";

// The one place that picks a concrete provider. Everything else in the app
// calls getSignatureProvider() and codes against the SignatureProvider
// interface -- adding a second provider later is a new file implementing
// that interface plus a case here, not a rewrite of the send/void/webhook
// call sites.
export function getSignatureProvider(): SignatureProvider {
  const provider = process.env.SIGNATURE_PROVIDER ?? "signwell";
  switch (provider) {
    case "signwell":
      return new SignWellProvider();
    default:
      throw new Error(`Unknown SIGNATURE_PROVIDER "${provider}".`);
  }
}

// Downloads the final signed PDF once a document is completed. Kept
// provider-specific (unlike the rest of the interface) because it's only
// ever called right after a 'completed' webhook, from one place -- adding
// it to the SignatureProvider interface now would be speculative generality
// for a single call site.
export async function fetchCompletedDocumentBase64(providerDocumentId: string): Promise<string> {
  const apiKeyValue = process.env.SIGNWELL_API_KEY;
  if (!apiKeyValue) throw new Error("SIGNWELL_API_KEY is not set.");

  // NEEDS LIVE VERIFICATION: SignWell's docs show this endpoint as both
  // `/completed_pdf` (dedicated reference page) and `/pdf` (sidebar
  // listing) -- confirm which is correct against a real account before
  // relying on this in production.
  const res = await fetch(
    `https://www.signwell.com/api/v1/documents/${providerDocumentId}/completed_pdf`,
    { headers: { "X-Api-Key": apiKeyValue } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SignWell completed-PDF fetch failed (${res.status}): ${body}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}
