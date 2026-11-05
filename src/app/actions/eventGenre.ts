"use server";

import { createClient } from "@/lib/supabase/server";

// Open genre tag set on events.genre_tags (2026-11-05, per Greg -- tags
// should be "flexible enough to add more as we discover them", not a
// fixed enum). Stored lowercase so casing variants collapse into one tag
// ("Rock"/"rock"/"ROCK" -> "rock"); display code title-cases for
// presentation. Deliberately NOT run through records.ts's generic
// updateField/EDITABLE_FIELDS system -- genre_tags is a text[], not a
// scalar value that system can set, same split as
// plays.settlement_expenses going through its own dedicated action.
export async function updateEventGenreTags(
  eventId: string,
  tags: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = Array.from(
    new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t !== ""))
  );
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ genre_tags: normalized })
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Every distinct tag already in use across all events, for the tag
// editor's autocomplete -- keeps new tags consistent with existing ones
// instead of fragmenting ("americana" vs "Americana/Folk") across 2000+
// events. Cheap enough at this table's current size to just select the
// column and flatten/dedupe in JS rather than standing up a Postgres
// function for it.
export async function listDistinctGenreTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("genre_tags")
    .not("genre_tags", "eq", "{}");
  if (error) {
    throw new Error(`Couldn't load existing genre tags: ${error.message}`);
  }
  const set = new Set<string>();
  for (const row of data ?? []) {
    for (const tag of (row.genre_tags as string[] | null) ?? []) set.add(tag);
  }
  return Array.from(set).sort();
}
