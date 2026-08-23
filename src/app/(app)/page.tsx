import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: contactCount },
    { count: companyCount },
    { count: eventCount },
    { count: playCount },
    { data: artists },
  ] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("plays").select("*", { count: "exact", head: true }),
    supabase.from("artists").select("id, name").order("name"),
  ]);

  const cards = [
    { href: "/contacts", label: "Contacts", count: contactCount ?? 0 },
    { href: "/companies", label: "Venues", count: companyCount ?? 0 },
    { href: "/events", label: "Events", count: eventCount ?? 0 },
    { href: "/plays", label: "Plays", count: playCount ?? 0 },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Dashboard</h1>
      <p className="italic text-black/60 dark:text-white/60 mb-8">
        Welcome back. Here&apos;s what&apos;s in the CRM right now.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group relative overflow-hidden border border-black/10 dark:border-white/10 rounded-lg p-5 hover:border-ridge-orange/50 hover:shadow-sm transition-colors bg-white dark:bg-neutral-900"
          >
            <span className="absolute inset-x-0 top-0 h-0.5 bg-ridge-orange scale-x-0 group-hover:scale-x-100 origin-left transition-transform" />
            <div className="text-3xl font-semibold tabular-nums">{card.count}</div>
            <div className="text-sm text-black/60 dark:text-white/60 mt-1">
              {card.label}
            </div>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Artists / Roster</h2>
        <ul className="flex flex-col gap-2">
          {artists?.map((artist) => (
            <li
              key={artist.id}
              className="border border-black/10 dark:border-white/10 rounded-lg px-4 py-3 bg-white dark:bg-neutral-900"
            >
              {artist.name}
            </li>
          ))}
          {!artists?.length && (
            <p className="text-sm text-black/60 dark:text-white/60">
              No artists yet.
            </p>
          )}
        </ul>
      </div>
    </div>
  );
}
