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
