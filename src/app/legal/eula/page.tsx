import type { Metadata } from "next";
import { LegalLayout, Section } from "../_components/LegalLayout";

export const metadata: Metadata = {
  title: "End User License Agreement — Base Camp",
  description: "Terms of use for Base Camp, Ridge Music Group's internal operations tool.",
};

// Public, unauthenticated page -- see the comment at the top of
// ../privacy/page.tsx for why this exists and the scope it's written for
// (Base Camp is Ridge Music Group's own internal tool, not distributed
// software). Also exempted in src/lib/supabase/middleware.ts.
export default function EulaPage() {
  return (
    <LegalLayout title="End User License Agreement">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Last updated November 8, 2026</p>

      <Section heading="Scope">
        <p>
          Base Camp is internal software built, owned, and operated by Ridge Music Group for its
          own staff&apos;s use in managing artist bookings, venue relationships, contracts, and related
          financial records. It is not licensed, sold, or made available to any party outside Ridge
          Music Group.
        </p>
      </Section>

      <Section heading="Permitted use">
        <p>
          Access to Base Camp is granted only to individuals authorized by Ridge Music Group, for
          the purpose of conducting Ridge Music Group&apos;s business. Accounts are not transferable,
          and access may be revoked at any time at Ridge Music Group&apos;s discretion.
        </p>
      </Section>

      <Section heading="Third-party integrations">
        <p>
          Base Camp integrates with third-party services on Ridge Music Group&apos;s behalf, including
          QuickBooks Online for invoicing. Use of Base Camp&apos;s QuickBooks integration is subject to
          Ridge Music Group&apos;s own QuickBooks Online account terms with Intuit; Base Camp acts only
          as the tool through which that one account is accessed.
        </p>
      </Section>

      <Section heading="No warranty">
        <p>
          Base Camp is provided as-is, as an internal operational tool, without warranty of any
          kind. Ridge Music Group maintains it for its own use and makes no representations to any
          party outside the organization regarding its availability, accuracy, or fitness for any
          particular purpose.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms can be directed to Ridge Music Group at{" "}
          <a className="underline underline-offset-2" href="mailto:greg.burroughs@yahoo.com">
            greg.burroughs@yahoo.com
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}
