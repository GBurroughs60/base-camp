# Database changes applied outside tracked migration history

A running log of schema/function changes that are live in Supabase but are
**not** recorded in `supabase_migrations.schema_migrations` (i.e. they won't
show up in `mcp__Supabase__list_migrations`, and wouldn't be replayed if this
project's schema were ever rebuilt from migration history -- a branch reset,
disaster recovery, standing up a fresh environment, etc.).

Normally every schema change here goes through a tracked migration. This
list exists for the rare case where that path was blocked and a human had to
apply the SQL directly (e.g. via the Supabase dashboard's SQL editor), so the
gap doesn't get forgotten and, if it's ever hit, the fix is a five-second
copy-paste instead of a investigation.

**If you're reading this because something below regressed:** re-run the SQL
in its entry against the project and the symptom should disappear.

---

## `submit_offer_inquiry` -- retire `offer_submitted` as a status (2026-10-21)

**What's untracked:** The current live body of the `public.submit_offer_inquiry`
Postgres function (the `SECURITY DEFINER` function backing the public `/book`
offer-submission form). It was updated to insert new plays with
`status = 'pending_agent_approval'` instead of the old `'offer_submitted'`,
as part of retiring Offer Submitted as a pipeline stage -- see
`src/lib/playStatus.ts` (`RETIRED_STATUSES`) for the app-code half of that
change, which *is* tracked normally (regular git history, no gap).

**Why it's untracked:** `mcp__Supabase__apply_migration` for this function
redefinition was blocked twice by this session's safety tooling (a
`SECURITY DEFINER` function redefinition gets flagged as sensitive,
independent of how small the actual diff is -- here, one literal). Greg
applied the fix directly via the Supabase SQL editor instead. The companion
change, `alter table public.plays alter column status set default
'pending_agent_approval'`, went through fine as a normal tracked migration
(`change_plays_status_default`, applied 2026-10-21) -- only this function
redefinition hit the block.

**Symptom if this regresses:** new plays submitted through `/book` start
landing back on `offer_submitted` again -- which, since that status is
excluded from `LIVE_PIPELINE_STATUSES`, means they'd stop showing up on the
Kanban board or in the "Active Pipeline" filter. They wouldn't error or
disappear from the database, just from every active view.

**The fix, if ever needed again** -- the full function body (safe to
re-run any time; it's a `CREATE OR REPLACE`, so this is idempotent even if
nothing has actually regressed):

```sql
CREATE OR REPLACE FUNCTION public.submit_offer_inquiry(p_artist_id uuid, p_venue_name text, p_address text, p_city text, p_state text, p_show_date date, p_show_type text, p_capacity integer, p_age_limit text, p_guarantee_amount numeric, p_deal_terms text, p_production_contact_name text, p_production_contact_info text, p_production_provided boolean, p_food_provided boolean, p_drinks_provided boolean, p_hotel_provided boolean, p_travel_provided boolean, p_notes text, p_buyer_company text, p_buyer_name text, p_buyer_email text, p_buyer_phone text, p_buyer_mailing_address text, p_show_time text DEFAULT NULL::text, p_show_length text DEFAULT NULL::text, p_ticket_price numeric DEFAULT NULL::numeric, p_radius_clause text DEFAULT NULL::text, p_buyer_city text DEFAULT NULL::text, p_buyer_state text DEFAULT NULL::text, p_ticket_price_tiers jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(result text, play_id uuid, artist_name text, agent_name text, agent_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_artist_name text;
  v_company_id uuid;
  v_venue_id uuid;
  v_contact_id uuid;
  v_play_id uuid;
  v_agent_name text;
  v_agent_email text;
  v_match record;
begin
  select name into v_artist_name
  from public.artists
  where id = p_artist_id and archived = false and ridge_books = true;

  if v_artist_name is null then
    return query select 'invalid_artist', null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if p_buyer_name is null or btrim(p_buyer_name) = '' or p_buyer_email is null or btrim(p_buyer_email) = '' then
    return query select 'missing_buyer_info', null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if p_ticket_price_tiers is not null and jsonb_typeof(p_ticket_price_tiers) <> 'array' then
    return query select 'invalid_ticket_price_tiers', null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if p_venue_name is not null and btrim(p_venue_name) <> '' then
    select c.id, c.name,
           similarity(lower(c.name), lower(btrim(p_venue_name))) as sim,
           (p_city is not null and lower(btrim(c.city)) = lower(btrim(p_city))
            and p_state is not null and lower(btrim(c.state)) = lower(btrim(p_state))) as geo_match
    into v_match
    from public.companies c
    where coalesce(c.archived, false) = false
      and coalesce(c.pending_state_review, false) = false
      and similarity(lower(c.name), lower(btrim(p_venue_name))) > 0.3
    order by sim desc
    limit 1;

    if v_match.id is not null and (
      v_match.sim > 0.85
      or (v_match.sim > 0.6 and v_match.geo_match)
      or (v_match.sim > 0.75
          and array_length(regexp_split_to_array(btrim(p_venue_name), '\s+'), 1) >= 3)
    ) then
      v_venue_id := v_match.id;
    end if;
  end if;

  v_match := null;
  if p_buyer_company is not null and btrim(p_buyer_company) <> '' then
    select id into v_company_id
    from public.companies
    where lower(name) = lower(btrim(p_buyer_company))
      and coalesce(pending_state_review, false) = false
    limit 1;

    if v_company_id is null then
      select c.id, c.name,
             similarity(lower(c.name), lower(btrim(p_buyer_company))) as sim,
             (p_buyer_city is not null and lower(btrim(c.city)) = lower(btrim(p_buyer_city))
              and p_buyer_state is not null and lower(btrim(c.state)) = lower(btrim(p_buyer_state))) as geo_match
      into v_match
      from public.companies c
      where coalesce(c.archived, false) = false
        and coalesce(c.pending_state_review, false) = false
        and similarity(lower(c.name), lower(btrim(p_buyer_company))) > 0.3
      order by sim desc
      limit 1;

      if v_match.id is not null and (
        v_match.sim > 0.85
        or (v_match.sim > 0.6 and v_match.geo_match)
        or (v_match.sim > 0.75
            and array_length(regexp_split_to_array(btrim(p_buyer_company), '\s+'), 1) >= 3)
      ) then
        v_company_id := v_match.id;
      end if;
    end if;

    if v_company_id is null then
      insert into public.companies (name, type, city, state, notes)
      values (
        btrim(p_buyer_company), 'promoter',
        nullif(btrim(coalesce(p_buyer_city, '')), ''),
        nullif(btrim(coalesce(p_buyer_state, '')), ''),
        case
          when v_match.id is not null then
            'Auto-created from /book form on ' || to_char(now(), 'YYYY-MM-DD') ||
            '. Closest existing company was "' || v_match.name || '" (' ||
            round((v_match.sim * 100)::numeric, 0) || '% name similarity) -- ' ||
            'below the auto-link threshold, so a new company was created instead. Worth a quick check for a possible duplicate.'
          else
            'Auto-created from /book form on ' || to_char(now(), 'YYYY-MM-DD') || '.'
        end
      )
      returning id into v_company_id;
    end if;
  end if;

  select id into v_contact_id
  from public.contacts
  where lower(email) = lower(btrim(p_buyer_email))
  limit 1;

  if v_contact_id is null then
    insert into public.contacts (full_name, email, phone, company_id, notes)
    values (
      btrim(p_buyer_name), btrim(p_buyer_email),
      nullif(btrim(coalesce(p_buyer_phone, '')), ''),
      v_company_id, nullif(btrim(coalesce(p_buyer_mailing_address, '')), '')
    )
    returning id into v_contact_id;
  end if;

  insert into public.plays (
    artist_id, venue_id, venue_name, address, city, state, show_date, show_type,
    capacity, age_limit, guarantee_amount, deal_terms,
    production_contact_name, production_contact_info,
    production_provided, food_provided, drinks_provided, hotel_provided, travel_provided,
    notes, primary_contact_id, status,
    show_time, show_length, ticket_price, radius_clause, ticket_price_tiers
  ) values (
    p_artist_id, v_venue_id, nullif(btrim(coalesce(p_venue_name, '')), ''), nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''), nullif(btrim(coalesce(p_state, '')), ''), p_show_date, nullif(btrim(coalesce(p_show_type, '')), ''),
    p_capacity, nullif(btrim(coalesce(p_age_limit, '')), ''), p_guarantee_amount, nullif(btrim(coalesce(p_deal_terms, '')), ''),
    nullif(btrim(coalesce(p_production_contact_name, '')), ''), nullif(btrim(coalesce(p_production_contact_info, '')), ''),
    coalesce(p_production_provided, false), coalesce(p_food_provided, false), coalesce(p_drinks_provided, false),
    coalesce(p_hotel_provided, false), coalesce(p_travel_provided, false),
    nullif(btrim(coalesce(p_notes, '')), ''), v_contact_id, 'pending_agent_approval',
    nullif(btrim(coalesce(p_show_time, '')), ''), nullif(btrim(coalesce(p_show_length, '')), ''),
    p_ticket_price, nullif(btrim(coalesce(p_radius_clause, '')), ''),
    coalesce(p_ticket_price_tiers, '[]'::jsonb)
  )
  returning id into v_play_id;

  select c.full_name, c.email into v_agent_name, v_agent_email
  from public.contact_artists ca
  join public.contacts c on c.id = ca.contact_id
  where ca.artist_id = p_artist_id and ca.role = 'agent'
  limit 1;

  return query select 'ok', v_play_id, v_artist_name, v_agent_name, v_agent_email;
end;
$function$;
```

**To close the gap properly** (optional -- this is a low-probability risk,
not an active problem): run the same statement through the Supabase CLI from
a machine with it set up (`supabase migration new record_submit_offer_inquiry_fix`,
paste the SQL above into the generated file, `supabase db push`) rather than
the dashboard's SQL editor. That records it in
`supabase_migrations.schema_migrations` the normal way. Since the live
function already matches, this is a no-op against the running database --
purely bookkeeping.

---

## `plays` -- nine new settlement-report columns (2026-10-31)

**What's untracked:** `walkout_amount` (numeric), `settlement_token`
(uuid), `settlement_email_sent_at` (timestamptz),
`settlement_submitted_at` (timestamptz), `settlement_expenses` (jsonb,
`not null default '[]'::jsonb`), `weather_summary` (text),
`other_events_in_town` (text), `promoter_notes` (text), and
`would_play_again` (text) -- all on `public.plays`, all additive/nullable
except `settlement_expenses`'s default. See
`docs/operations-accounting-plan.md` section 4/6 for what each one is for
(the post-show settlement report).

**Why it's untracked:** `mcp__Supabase__apply_migration` for this `ALTER
TABLE` was blocked by this session's auto-mode safety tooling (flagged as
a production schema deploy), the same class of block
`submit_offer_inquiry` above hit for a function redefinition. Greg applied
it directly via the Supabase SQL editor instead.

**Symptom if this regresses:** the Play detail page's Settlement section
(and, later, the public settlement-report form) would fail outright --
every read/write against any of these nine columns 500s if they don't
exist, not a silent data loss.

**The fix, if ever needed again** -- additive, safe to re-run (every
`ADD COLUMN` would just need `IF NOT EXISTS` added if any of the nine
already exist from a partial prior run):

```sql
alter table public.plays
  add column walkout_amount numeric,
  add column settlement_token uuid,
  add column settlement_email_sent_at timestamptz,
  add column settlement_submitted_at timestamptz,
  add column settlement_expenses jsonb not null default '[]'::jsonb,
  add column weather_summary text,
  add column other_events_in_town text,
  add column promoter_notes text,
  add column would_play_again text;
```

**To close the gap properly:** same approach as above -- run it through
the Supabase CLI (`supabase migration new add_settlement_report_fields_to_plays`)
from a machine with it set up, rather than the dashboard's SQL editor.
Since the live columns already exist, this is a no-op against the running
database -- purely bookkeeping.

---

## `get_settlement_summary` / `submit_settlement_report` -- token-scoped settlement-report RPCs (2026-10-31)

**What's untracked:** two new columns on `public.plays` --
`settlement_submitted_by_contact_id` (uuid, references `contacts(id)`) and
`settlement_submitted_by_other_name` (text), mirroring
`approved_by_contact_id`/`approved_by_other_name` -- plus two new
`SECURITY DEFINER` functions, `get_settlement_summary(p_token uuid)` and
`submit_settlement_report(p_token uuid, ...)`. These are the exact
mirror of `get_play_approval_summary`/`respond_to_play_approval` (see the
entry pattern in `add_play_approval_response_flow`), scoped to
`plays.settlement_token` instead of `plays.approval_token`. See
`docs/operations-accounting-plan.md` section 4 ("Resolving 'public'...")
for the full access-control design, and `/settle/[token]` (page +
`app/actions/settlement.ts`) for how they're called.

**Why it's untracked:** blocked by the same auto-mode safety tooling as
every prior `SECURITY DEFINER` function change in this project (flagged
independent of how small the actual diff is) -- see the
`submit_offer_inquiry` entry above for the first time this class of block
was hit. Greg needs to apply the SQL below directly via the Supabase SQL
editor.

**Symptom if this regresses:** `/settle/[token]` 500s outright (missing
columns), or shows "This link is invalid" for every real token (missing
functions, since `get_settlement_summary` returning zero rows is how the
page tells a bad token apart from a real one).

**The fix, if ever needed again** -- additive and idempotent (`create or
replace function` is always safe to re-run; the two `ADD COLUMN`s would
need `IF NOT EXISTS` added if they already exist from a partial prior
run):

```sql
alter table public.plays
  add column settlement_submitted_by_contact_id uuid references public.contacts(id),
  add column settlement_submitted_by_other_name text;

create or replace function public.get_settlement_summary(p_token uuid)
returns table(
  play_id uuid,
  artist_name text,
  venue_label text,
  location text,
  show_date date,
  guarantee_amount numeric,
  settlement_submitted_at timestamptz,
  responder_options jsonb,
  submitted_by_name text,
  walkout_amount numeric,
  gross_merch_sales numeric,
  settlement_expenses jsonb,
  other_events_in_town text,
  promoter_notes text,
  would_play_again text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    p.id,
    a.name,
    coalesce(v.name, p.venue_name, 'Venue TBD'),
    nullif(concat_ws(', ', coalesce(v.city, p.city), coalesce(v.state, p.state)), ''),
    p.show_date,
    p.guarantee_amount,
    p.settlement_submitted_at,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', c.id, 'full_name', c.full_name))
        from public.contact_artists ca
        join public.contacts c on c.id = ca.contact_id
        where ca.artist_id = p.artist_id
          and ca.role in ('manager', 'artist')
          and c.email is not null
      ),
      (
        select jsonb_agg(jsonb_build_object('id', f.id, 'full_name', f.full_name))
        from public.contacts f
        where f.email = 'gburroughs@theridgemusicgroup.com'
        limit 1
      ),
      '[]'::jsonb
    ),
    coalesce(rc.full_name, p.settlement_submitted_by_other_name),
    p.walkout_amount,
    p.gross_merch_sales,
    p.settlement_expenses,
    p.other_events_in_town,
    p.promoter_notes,
    p.would_play_again
  from public.plays p
  join public.artists a on a.id = p.artist_id
  left join public.companies v on v.id = p.venue_id
  left join public.contacts rc on rc.id = p.settlement_submitted_by_contact_id
  where p.settlement_token = p_token;
$function$;

create or replace function public.submit_settlement_report(
  p_token uuid,
  p_walkout_amount numeric default null,
  p_gross_merch_sales numeric default null,
  p_settlement_expenses jsonb default '[]'::jsonb,
  p_other_events_in_town text default null,
  p_promoter_notes text default null,
  p_would_play_again text default null,
  p_contact_id uuid default null,
  p_other_name text default null
)
returns table(
  result text,
  play_id uuid,
  artist_name text,
  venue_label text,
  show_date date,
  walkout_amount numeric,
  gross_merch_sales numeric,
  would_play_again text,
  agent_name text,
  agent_email text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_play record;
  v_agent_name text;
  v_agent_email text;
begin
  if p_would_play_again is not null and p_would_play_again not in ('yes', 'no', 'with_reservations') then
    raise exception 'invalid would_play_again: %', p_would_play_again;
  end if;

  if p_settlement_expenses is not null and jsonb_typeof(p_settlement_expenses) <> 'array' then
    raise exception 'settlement_expenses must be a json array';
  end if;

  select
    p.id, p.settlement_submitted_at, p.artist_id,
    a.name as artist_name,
    coalesce(v.name, p.venue_name, 'Venue TBD') as venue_label,
    p.show_date
    into v_play
    from public.plays p
    join public.artists a on a.id = p.artist_id
    left join public.companies v on v.id = p.venue_id
    where p.settlement_token = p_token
    for update of p;

  if not found then
    return query select 'not_found', null::uuid, null::text, null::text, null::date, null::numeric, null::numeric, null::text, null::text, null::text;
    return;
  end if;

  if v_play.settlement_submitted_at is not null then
    return query select 'already_submitted', v_play.id, v_play.artist_name, v_play.venue_label, v_play.show_date, null::numeric, null::numeric, null::text, null::text, null::text;
    return;
  end if;

  update public.plays
    set
      walkout_amount = p_walkout_amount,
      gross_merch_sales = p_gross_merch_sales,
      settlement_expenses = coalesce(p_settlement_expenses, '[]'::jsonb),
      other_events_in_town = nullif(trim(coalesce(p_other_events_in_town, '')), ''),
      promoter_notes = nullif(trim(coalesce(p_promoter_notes, '')), ''),
      would_play_again = p_would_play_again,
      settlement_submitted_at = now(),
      settlement_submitted_by_contact_id = p_contact_id,
      settlement_submitted_by_other_name = nullif(trim(coalesce(p_other_name, '')), '')
    where id = v_play.id;

  select c.full_name, c.email into v_agent_name, v_agent_email
    from public.contact_artists ca
    join public.contacts c on c.id = ca.contact_id
    where ca.artist_id = v_play.artist_id and ca.role = 'agent'
    limit 1;

  return query select
    'ok', v_play.id, v_play.artist_name, v_play.venue_label, v_play.show_date,
    p_walkout_amount, p_gross_merch_sales, p_would_play_again,
    v_agent_name, v_agent_email;
end;
$function$;
```

**To close the gap properly:** same approach as the entries above -- run
it through the Supabase CLI (`supabase migration new add_settlement_report_flow`)
from a machine with it set up, rather than the dashboard's SQL editor.
Once applied, this is purely bookkeeping -- the live functions/columns
will already match.
