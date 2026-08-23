"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/companies", label: "Venues" },
  { href: "/events", label: "Events" },
  { href: "/plays", label: "Plays" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 sticky top-0 h-screen bg-ridge-ink text-white flex flex-col">
      <div className="px-5 pt-6 pb-5 border-b border-white/10 flex items-center gap-3">
        <Image
          src="/brand/ridge-light-icon.png"
          alt=""
          width={36}
          height={22}
          className="shrink-0"
          priority
        />
        <div className="min-w-0">
          <div className="font-display text-lg font-medium tracking-tight leading-tight truncate">
            Base Camp
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 truncate">
            The Ridge Music Group
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                "group relative flex items-center rounded-md px-3 py-2 text-sm transition-colors " +
                (active
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/55 hover:text-white hover:bg-white/5")
              }
            >
              <span
                className={
                  "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-ridge-orange transition-opacity " +
                  (active ? "opacity-100" : "opacity-0 group-hover:opacity-40")
                }
              />
              <span className="pl-2">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={signOut}
          className="w-full text-left rounded-md px-3 py-2 text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
