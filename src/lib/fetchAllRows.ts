// Supabase/PostgREST caps any single request at 1000 rows (db.max_rows on
// this project) regardless of how the query is filtered or ordered -- a
// .select() that matches more than that silently truncates instead of
// erroring, which is how the Venues list page showed "1000 records" while
// the sidebar's own `count: "exact", head: true` query (not subject to
// this cap, since it never returns row data) correctly said 2233. Contacts
// and Events were already past 1000 rows too, silently hiding real
// records; Artists and Plays aren't yet but would hit the same wall the
// day they cross it. This fetches every matching row in db.max_rows-sized
// pages until a page comes back short, which is the only one of
// Base Camp's list pages that expects "I have every row" (DataTable does
// all of its search/sort/filter client-side on whatever array it's
// handed -- there's no separate server-paginated path these pages fall
// back to).
//
// `pageQuery` must build the FULL query fresh on every call (starting from
// `supabase.from(...)`), not reuse a single builder across calls --
// PostgrestFilterBuilder instances aren't meant to be re-awaited/re-ranged
// after their first request.
const PAGE_SIZE = 1000;

export type FetchAllRowsResult<T> = {
  rows: T[];
  // First page error encountered, if any -- rows holds whatever pages
  // completed before it. Most callers only need `rows` (matching how these
  // list pages already didn't check query errors before this helper
  // existed); a caller that already has its own error-surfacing UI (see
  // events/page.tsx) can report this instead of swallowing it, same
  // discipline as the events_needing_attention fix this sits beside.
  error: string | null;
};

export async function fetchAllRows<T>(
  pageQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<FetchAllRowsResult<T>> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await pageQuery(from, from + PAGE_SIZE - 1);
    if (error) return { rows: all, error: error.message };
    if (!data) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { rows: all, error: null };
}
