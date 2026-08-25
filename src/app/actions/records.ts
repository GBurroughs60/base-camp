"use server";

import { createClient } from "@/lib/supabase/server";

export type TableName = "contacts" | "companies" | "events" | "plays";

// Whitelist of columns each table allows editing/creating through the
// generic inline-edit and quick-create UI. This is the single source of
// truth that keeps client-driven writes from touching columns we don't
// want exposed this way (raw_import, created_at, id, etc).
const EDITABLE_FIELDS: Record<TableName, Set<string>> = {
  contacts: new Set(["full_name", "email", "phone", "title", "notes", "company_id"]),
  companies: new Set([
    "name",
    "type",
    "city",
    "state",
    "country",
    "phone",
    "website",
    "notes",
    "capacity",
  ]),
  events: new Set([
    "name",
    "city",
    "state",
    "country",
    "website",
    "is_public",
    "venue_id",
    "primary_contact_id",
    "notes",
  ]),
  plays: new Set([
    "show_date",
    "venue_name",
    "city",
    "state",
    "set_type",
    "attendance",
    "tickets_sold",
    "ticket_price",
    "gross_revenue",
    "gross_merch_sales",
    "band_percentage",
    "guarantee_amount",
    "amount_due_to_agency",
    "management_commission_pct",
    "management_commission_amount",
    "booking_agent_commission_pct",
    "booking_agent_commission_amount",
    "deal_terms",
    "bill_position",
    "other_artists_on_bill",
    "capacity",
    "age_limit",
    "contract_status",
    "contract_due_date",
    "deposit_status",
    "deposit_amount",
    "deposit_due_date",
    "final_payment_received",
    "notes",
    "venue_id",
    "event_id",
    "primary_contact_id",
    "artist_id",
  ]),
};

const REQUIRED_ON_CREATE: Record<TableName, string[]> = {
  contacts: ["full_name"],
  companies: ["name"],
  events: ["name"],
  plays: [],
};

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function updateField(
  table: TableName,
  id: string,
  field: string,
  value: string | number | boolean | null
): Promise<ActionResult> {
  if (!EDITABLE_FIELDS[table]?.has(field)) {
    return { ok: false, error: `"${field}" is not editable on ${table}` };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ [field]: value === "" ? null : value })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

function pickAllowed(table: TableName, data: Record<string, unknown>) {
  const allowed = EDITABLE_FIELDS[table];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowed.has(k)) out[k] = v === "" ? null : v;
  }
  return out;
}

export async function createRecord(
  table: TableName,
  rawData: Record<string, unknown>
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const data = pickAllowed(table, rawData);

  for (const field of REQUIRED_ON_CREATE[table]) {
    const v = data[field];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
      return { ok: false, error: `${field.replace("_", " ")} is required` };
    }
  }

  if (table === "companies" && !data.type) {
    data.type = "venue";
  }

  if (table === "plays") {
    if (!data.venue_id && !data.event_id) {
      return { ok: false, error: "A venue or event is required" };
    }
    if (!data.artist_id) {
      // Only one artist on the roster today -- default to them rather than
      // surfacing an artist picker for a choice that isn't really a choice
      // yet. Revisit once the roster grows.
      const { data: artists } = await supabase
        .from("artists")
        .select("id")
        .order("name")
        .limit(1);
      if (artists?.[0]) data.artist_id = artists[0].id;
    }
  }

  const { data: inserted, error } = await supabase
    .from(table)
    .insert(data)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: inserted.id as string } };
}

export type GlobalSearchGroup = {
  table: TableName;
  label: string;
  results: { id: string; label: string; sublabel: string | null; href: string }[];
};

// Site-wide search from the Dashboard. Scoped to structured fields only --
// notes/free-text/deal-terms fields are excluded so results stay precise
// (matching only real names, locations, contact info, and statuses) rather
// than surfacing noisy substring hits buried in long-form notes.
export async function globalSearch(query: string): Promise<GlobalSearchGroup[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();
  const esc = q.replace(/[%,]/g, "");
  if (!esc) return [];

  const [contactsRes, companiesRes, eventsRes, playsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, email, phone, title")
      .or(
        `full_name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%,title.ilike.%${esc}%`
      )
      .order("full_name")
      .limit(6),
    supabase
      .from("companies")
      .select("id, name, type, city, state, phone, website")
      .or(
        `name.ilike.%${esc}%,city.ilike.%${esc}%,state.ilike.%${esc}%,phone.ilike.%${esc}%,website.ilike.%${esc}%`
      )
      .order("name")
      .limit(6),
    supabase
      .from("events")
      .select("id, name, city, state")
      .or(`name.ilike.%${esc}%,city.ilike.%${esc}%,state.ilike.%${esc}%`)
      .order("name")
      .limit(6),
    supabase
      .from("plays")
      .select(
        "id, show_date, venue_name, city, state, set_type, contract_status, deposit_status, artists(name)"
      )
      .or(
        `venue_name.ilike.%${esc}%,city.ilike.%${esc}%,state.ilike.%${esc}%,set_type.ilike.%${esc}%,contract_status.ilike.%${esc}%,deposit_status.ilike.%${esc}%`
      )
      .order("show_date", { ascending: false })
      .limit(6),
  ]);

  const groups: GlobalSearchGroup[] = [];

  if (contactsRes.data?.length) {
    groups.push({
      table: "contacts",
      label: "Contacts",
      results: contactsRes.data.map((c) => ({
        id: c.id,
        label: c.full_name,
        sublabel: c.title || c.email || c.phone || null,
        href: `/contacts/${c.id}`,
      })),
    });
  }

  if (companiesRes.data?.length) {
    groups.push({
      table: "companies",
      label: "Venues & Companies",
      results: companiesRes.data.map((c) => ({
        id: c.id,
        label: c.name,
        sublabel: [c.city, c.state].filter(Boolean).join(", ") || null,
        href: `/companies/${c.id}`,
      })),
    });
  }

  if (eventsRes.data?.length) {
    groups.push({
      table: "events",
      label: "Events",
      results: eventsRes.data.map((e) => ({
        id: e.id,
        label: e.name,
        sublabel: [e.city, e.state].filter(Boolean).join(", ") || null,
        href: `/events/${e.id}`,
      })),
    });
  }

  if (playsRes.data?.length) {
    groups.push({
      table: "plays",
      label: "Plays",
      results: playsRes.data.map((p) => {
        const artist = p.artists as unknown as { name: string } | null;
        return {
          id: p.id,
          label: [artist?.name, p.venue_name].filter(Boolean).join(" @ ") || "Play",
          sublabel:
            [p.show_date, [p.city, p.state].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" · ") || null,
          href: `/plays/${p.id}`,
        };
      }),
    });
  }

  return groups;
}

export type SearchTable = "companies" | "events" | "contacts";

export async function searchRecords(
  table: SearchTable,
  query: string
): Promise<{ id: string; label: string; sublabel: string | null }[]> {
  const supabase = await createClient();
  const nameCol = table === "contacts" ? "full_name" : "name";
  const extraCols = table === "companies" ? ", city, state" : "";

  let q = supabase
    .from(table)
    .select(`id, ${nameCol}${extraCols}`)
    .order(nameCol)
    .limit(20);

  if (query.trim()) {
    q = q.ilike(nameCol, `%${query.trim()}%`);
  }

  const { data } = await q;
  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    const sub =
      table === "companies"
        ? [r.city, r.state].filter(Boolean).join(", ") || null
        : null;
    return { id: r.id as string, label: r[nameCol] as string, sublabel: sub };
  });
}
