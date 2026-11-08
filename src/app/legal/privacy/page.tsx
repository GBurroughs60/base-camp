import type { Metadata } from "next";
import { LegalLayout, Section } from "../_components/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — Base Camp",
  description: "How Base Camp handles data, including the QuickBooks Online integration.",
};

// Public, unauthenticated page -- required by Intuit's production-keys
// checklist (App details > "Add your app's end-user license agreement and
// privacy policy") for the Base Camp Invoicing QuickBooks app. Base Camp
// is an internal tool built and operated by Ridge Music Group for its own
// staff; it is not distributed or offered to the public, so this describes
// Base Camp's actual, current data handling rather than a generic SaaS
// privacy policy. Exempted from the login redirect in
// src/lib/supabase/middleware.ts (isPublicRoute) so it's reachable by
// Intuit's reviewers without a Base Camp account.
export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Last updated November 8, 2026</p>

      <Section heading="What Base Camp is">
        <p>
          Base Camp is an internal operations tool built by Ridge Music Group for its own staff.
          It is not a public product, is not offered or sold to other organizations, and is not
          available for anyone outside Ridge Music Group to create an account on.
        </p>
      </Section>

      <Section heading="What data we collect and store">
        <p>
          Base Camp stores the booking, artist, venue, contact, contract, and settlement data that
          Ridge Music Group staff enter directly in the course of running the business — for
          example artist rosters, venue and promoter contacts, offer and contract records, and
          post-show settlement reports. This data is stored in a Supabase (PostgreSQL) database
          operated for Ridge Music Group, and the application itself is hosted on Vercel.
        </p>
      </Section>

      <Section heading="The QuickBooks Online integration">
        <p>
          Base Camp connects to a single QuickBooks Online company file belonging to Ridge Music
          Group, using OAuth 2.0 with the <code className="text-xs">com.intuit.quickbooks.accounting</code> scope.
          That connection is used only to create and look up customers and invoices for booking
          commissions, and to receive invoice/payment status updates via QuickBooks webhooks. Base
          Camp does not read, store, or share any QuickBooks data beyond what&apos;s needed for that
          invoicing workflow, and the OAuth tokens for this connection are stored server-side with
          no public read access.
        </p>
      </Section>

      <Section heading="Who can access this data">
        <p>
          Only authenticated Ridge Music Group staff accounts can sign in to Base Camp. A small
          number of pages are reachable without an account because they&apos;re meant to be: an offer
          intake form for venues/promoters submitting a booking inquiry, a contract approve/decline
          link sent to the other party on a deal, and a post-show settlement report form sent to
          artists or their representatives after a show. Each of those is scoped to a single,
          unguessable token tied to one specific booking — none of them expose the rest of Base
          Camp&apos;s data.
        </p>
      </Section>

      <Section heading="Data we don't do">
        <p>
          We don&apos;t sell data, and we don&apos;t share it with third parties except the service providers
          that make Base Camp work (Supabase for the database, Vercel for hosting, QuickBooks
          Online for invoicing, and email/e-signature providers used to send contracts and
          settlement requests) — each solely to perform that function for Ridge Music Group.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about this policy or about data Base Camp holds can be directed to Ridge Music
          Group at{" "}
          <a className="underline underline-offset-2" href="mailto:greg.burroughs@yahoo.com">
            greg.burroughs@yahoo.com
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}
