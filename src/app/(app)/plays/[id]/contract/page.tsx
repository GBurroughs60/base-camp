import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchContractContext, buildContractMergeData, SCHEDULE_PER_ADVANCE } from "@/lib/contractData";
import { CONTRACT_TBD } from "@/lib/generateContract";
import InlineEditField from "@/components/inline/InlineEditField";
import InlineLocationField from "@/components/inline/InlineLocationField";
import InlineBooleanChip from "@/components/inline/InlineBooleanChip";
import GenerateContractButton from "@/components/inline/GenerateContractButton";
import ContractReviewActions from "@/components/inline/ContractReviewActions";
import { getContractSignature } from "@/app/actions/contractReview";

// Resolved-value styling: a genuinely missing field is a warning (red), an
// intentional standing default is muted but calm (amber) -- these two read
// very differently on purpose, since only one of them means "fix this
// before sending." Everything else is just the real value, in normal text.
function resolvedClass(resolved: string): string {
  if (resolved === CONTRACT_TBD) return "text-red-600 dark:text-red-400 font-medium";
  if (resolved === SCHEDULE_PER_ADVANCE || resolved === "N/A" || resolved === "None") {
    return "text-amber-600 dark:text-amber-400";
  }
  return "text-black/70 dark:text-white/70";
}

function FieldRow({
  label,
  children,
  resolved,
  note,
}: {
  label: string;
  children: React.ReactNode;
  resolved: string;
  note?: string;
}) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5 last:border-0">
      <td className="py-2.5 pr-4 text-black/50 dark:text-white/50 align-top whitespace-nowrap text-sm">
        {label}
      </td>
      <td className="py-2.5 pr-4 align-top text-sm">
        {children}
        {note && (
          <div className="text-xs text-black/40 dark:text-white/40 mt-0.5">{note}</div>
        )}
      </td>
      <td className={`py-2.5 align-top text-sm ${resolvedClass(resolved)}`}>{resolved}</td>
    </tr>
  );
}

function SectionTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900 mb-4">
      <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">{title}</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            <th className="pb-2 pr-4 text-xs font-medium text-black/40 dark:text-white/40 uppercase tracking-wide">
              Field
            </th>
            <th className="pb-2 pr-4 text-xs font-medium text-black/40 dark:text-white/40 uppercase tracking-wide">
              Current value
            </th>
            <th className="pb-2 text-xs font-medium text-black/40 dark:text-white/40 uppercase tracking-wide">
              Becomes in contract
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default async function ContractReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchContractContext(id);
  if (!result.ok) notFound();

  const { context } = result;
  const { play, artist, venue, purchaserContact, purchaserCompanyName, signatory } = context;
  const merged = buildContractMergeData(context);
  const signature = await getContractSignature(id);

  const hasContract = !!play.contract_file_path;

  return (
    <div>
      <Link
        href={`/plays/${play.id}`}
        className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
      >
        ← Back to play
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="font-display text-3xl font-medium mb-1">Contract Review</h1>
        <p className="text-black/60 dark:text-white/60">
          {artist.name} at {venue?.name ?? play.venue_name ?? "venue TBD"}
          {play.show_date ? ` — ${merged.show_date}` : ""}
        </p>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900 mb-4">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
          Status
        </h2>
        <ContractReviewActions
          playId={play.id}
          hasContract={hasContract}
          signature={signature}
        />
        {hasContract && (
          <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10">
            <GenerateContractButton playId={play.id} label="Download current contract (.docx)" />
            <p className="text-xs text-black/40 dark:text-white/40 mt-2">
              Downloads a fresh copy built from whatever&apos;s below right now, so you can check
              formatting before sending -- it doesn&apos;t need to match the last saved copy.
            </p>
          </div>
        )}
        {!hasContract && (
          <p className="text-xs text-black/40 dark:text-white/40 mt-2">
            No contract has been generated for this play yet. Generate one once the fields below
            look right.
          </p>
        )}
      </div>

      <p className="text-sm text-black/50 dark:text-white/50 mb-4">
        Every field below is what actually fills the contract template. Fix anything that looks
        wrong here, then regenerate or send -- there&apos;s no separate document to edit by hand.
      </p>

      <SectionTable title="Preamble">
        <FieldRow
          label="Agreement date"
          resolved={merged.agreement_date}
          note="Set automatically to today, whenever the contract is generated."
        >
          <span className="text-black/70 dark:text-white/70">{merged.agreement_date}</span>
        </FieldRow>
        <FieldRow
          label="Artist legal entity"
          resolved={merged.artist_legal_entity}
          note="Artist-level -- applies to every contract for this artist."
        >
          <Link
            href={`/artists/${artist.id}`}
            className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
          >
            {artist.legal_entity_name ?? artist.name} — edit on artist profile
          </Link>
        </FieldRow>
        <FieldRow
          label="Purchaser (buyer entity)"
          resolved={merged.purchaser_name}
          note="The buyer's company if one's on file, otherwise their own name -- see Signatures below."
        >
          <span className="text-black/70 dark:text-white/70">
            {purchaserCompanyName ?? purchaserContact?.full_name ?? "—"}
          </span>
        </FieldRow>
      </SectionTable>

      <SectionTable title="Section 1 — Engagement Details">
        {venue ? (
          <FieldRow label="Venue" resolved={merged.venue_name} note="Linked venue record -- edit there.">
            <Link
              href={`/companies/${venue.id}`}
              className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
            >
              {venue.name}
            </Link>
          </FieldRow>
        ) : (
          <FieldRow label="Venue name" resolved={merged.venue_name}>
            <InlineEditField table="plays" id={play.id} field="venue_name" value={play.venue_name} placeholder="Add venue name" />
          </FieldRow>
        )}
        {!venue && (
          <FieldRow label="City / state" resolved={merged.city_state}>
            <InlineLocationField table="plays" id={play.id} city={play.city} state={play.state} />
          </FieldRow>
        )}
        <FieldRow label="Address" resolved={merged.address}>
          <InlineEditField table="plays" id={play.id} field="address" value={play.address} placeholder="Add address" />
        </FieldRow>
        <FieldRow label="Show type" resolved={merged.show_type}>
          <InlineEditField table="plays" id={play.id} field="show_type" value={play.show_type} placeholder="Add" />
        </FieldRow>
        <FieldRow label="Bill position" resolved={merged.bill_position}>
          <InlineEditField table="plays" id={play.id} field="bill_position" value={play.bill_position} placeholder="Add" />
        </FieldRow>
        <FieldRow label="Other artists on bill" resolved={merged.other_artists_on_bill}>
          <InlineEditField table="plays" id={play.id} field="other_artists_on_bill" value={play.other_artists_on_bill} placeholder="Add" />
        </FieldRow>
        <FieldRow label="Capacity" resolved={merged.capacity}>
          <InlineEditField table="plays" id={play.id} field="capacity" value={play.capacity} type="number" placeholder="Add" />
        </FieldRow>
        <FieldRow label="Age limit" resolved={merged.age_limit}>
          <InlineEditField table="plays" id={play.id} field="age_limit" value={play.age_limit} placeholder="Add" />
        </FieldRow>
        <FieldRow label="Radius clause" resolved={merged.radius_clause}>
          <InlineEditField table="plays" id={play.id} field="radius_clause" value={play.radius_clause} placeholder="N/A" />
        </FieldRow>
        <FieldRow label="Contract due date" resolved={merged.contract_due_date}>
          <InlineEditField table="plays" id={play.id} field="contract_due_date" value={play.contract_due_date} type="date" format="date" placeholder="Add" />
        </FieldRow>
      </SectionTable>

      <SectionTable title="Section 2 — Schedule">
        <FieldRow label="Performance time" resolved={merged.show_time}>
          <InlineEditField table="plays" id={play.id} field="show_time" value={play.show_time} placeholder="Per Advance" />
        </FieldRow>
        <FieldRow label="Performance duration" resolved={merged.show_length}>
          <InlineEditField table="plays" id={play.id} field="show_length" value={play.show_length} placeholder="Per Advance" />
        </FieldRow>
        <FieldRow
          label="Load-in"
          resolved={merged.load_in}
          note="No field for this yet -- always Per Advance."
        >
          <span className="text-black/40 dark:text-white/40">—</span>
        </FieldRow>
        <FieldRow
          label="Soundcheck"
          resolved={merged.soundcheck_time}
          note="No field for this yet -- always Per Advance."
        >
          <span className="text-black/40 dark:text-white/40">—</span>
        </FieldRow>
        <FieldRow
          label="Doors"
          resolved={merged.doors_time}
          note="No field for this yet -- always Per Advance."
        >
          <span className="text-black/40 dark:text-white/40">—</span>
        </FieldRow>
        <FieldRow
          label="Curfew"
          resolved={merged.curfew}
          note="No field for this yet -- always Per Advance."
        >
          <span className="text-black/40 dark:text-white/40">—</span>
        </FieldRow>
      </SectionTable>

      <SectionTable title="Section 3 — Financial Terms">
        <FieldRow label="Guarantee" resolved={merged.guarantee_amount}>
          <InlineEditField table="plays" id={play.id} field="guarantee_amount" value={play.guarantee_amount} type="number" format="money" placeholder="Add" />
        </FieldRow>
        <FieldRow label="Ticket price" resolved={merged.ticket_price}>
          <InlineEditField table="plays" id={play.id} field="ticket_price" value={play.ticket_price} type="number" format="money" placeholder="N/A" />
        </FieldRow>
        <FieldRow label="Deal terms" resolved={merged.deal_terms}>
          <InlineEditField table="plays" id={play.id} field="deal_terms" value={play.deal_terms} placeholder="Add" />
        </FieldRow>
        <FieldRow label="Deposit amount" resolved={merged.deposit_amount}>
          <InlineEditField table="plays" id={play.id} field="deposit_amount" value={play.deposit_amount} type="number" format="money" placeholder="Add" />
        </FieldRow>
        <FieldRow label="Deposit due date" resolved={merged.deposit_due_date}>
          <InlineEditField table="plays" id={play.id} field="deposit_due_date" value={play.deposit_due_date} type="date" format="date" placeholder="Add" />
        </FieldRow>
      </SectionTable>

      <SectionTable title="Section 4 — Production &amp; Hospitality">
        <FieldRow label="Production contact" resolved={merged.production_contact_name}>
          <InlineEditField table="plays" id={play.id} field="production_contact_name" value={play.production_contact_name} placeholder="Add" />
        </FieldRow>
        <FieldRow label="Production contact info" resolved={merged.production_contact_info}>
          <InlineEditField table="plays" id={play.id} field="production_contact_info" value={play.production_contact_info} placeholder="Add" />
        </FieldRow>
        <FieldRow label="Production provided by" resolved={merged.production_provided}>
          <InlineBooleanChip table="plays" id={play.id} field="production_provided" value={play.production_provided ?? false} label="Purchaser provides production" />
        </FieldRow>
        <FieldRow label="Hotel provided" resolved={merged.hotel_provided}>
          <InlineBooleanChip table="plays" id={play.id} field="hotel_provided" value={play.hotel_provided ?? false} label="Hotel" />
        </FieldRow>
        <FieldRow label="Food provided" resolved={merged.food_provided}>
          <InlineBooleanChip table="plays" id={play.id} field="food_provided" value={play.food_provided ?? false} label="Food" />
        </FieldRow>
        <FieldRow label="Drinks provided" resolved={merged.drinks_provided}>
          <InlineBooleanChip table="plays" id={play.id} field="drinks_provided" value={play.drinks_provided ?? false} label="Drinks" />
        </FieldRow>
        <FieldRow label="Travel provided" resolved={merged.travel_provided}>
          <InlineBooleanChip table="plays" id={play.id} field="travel_provided" value={play.travel_provided ?? false} label="Travel" />
        </FieldRow>
      </SectionTable>

      <SectionTable title="Section 10 — General Provisions">
        <FieldRow label="Governing law" resolved={merged.governing_law_state}>
          <InlineEditField table="plays" id={play.id} field="governing_law_state" value={play.governing_law_state} placeholder="Add" />
        </FieldRow>
      </SectionTable>

      <SectionTable title="Section 11 — Signatures">
        <FieldRow
          label="Artist representative"
          resolved={merged.artist_rep_name}
          note="Artist-level signatory -- set once on the artist profile."
        >
          <Link
            href={`/artists/${artist.id}`}
            className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
          >
            {signatory?.full_name ?? "Not set — edit on artist profile"}
          </Link>
        </FieldRow>
        <FieldRow label="Artist rep email" resolved={merged.artist_rep_email}>
          <span className="text-black/70 dark:text-white/70">{signatory?.email ?? "—"}</span>
        </FieldRow>
        <FieldRow label="Artist rep phone" resolved={merged.artist_rep_phone}>
          <span className="text-black/70 dark:text-white/70">{signatory?.phone ?? "—"}</span>
        </FieldRow>
        {purchaserContact ? (
          <>
            <FieldRow label="Purchaser signatory" resolved={merged.purchaser_signatory_name}>
              <InlineEditField table="contacts" id={purchaserContact.id} field="full_name" value={purchaserContact.full_name} placeholder="Add name" />
            </FieldRow>
            <FieldRow label="Purchaser email" resolved={merged.purchaser_email}>
              <InlineEditField table="contacts" id={purchaserContact.id} field="email" value={purchaserContact.email} placeholder="Add email" />
            </FieldRow>
            <FieldRow label="Purchaser phone" resolved={merged.purchaser_phone}>
              <InlineEditField table="contacts" id={purchaserContact.id} field="phone" value={purchaserContact.phone} placeholder="Add phone" />
            </FieldRow>
          </>
        ) : (
          <FieldRow
            label="Purchaser signatory"
            resolved={merged.purchaser_signatory_name}
            note="No buyer contact set on this play -- add one from the play page's Contact card."
          >
            <Link
              href={`/plays/${play.id}`}
              className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
            >
              Go to play page
            </Link>
          </FieldRow>
        )}
      </SectionTable>
    </div>
  );
}
