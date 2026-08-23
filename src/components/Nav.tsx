"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/companies", label: "Companies & Venues" },
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
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="font-semibold tracking-tight">
            Base Camp
          </span>
          <nav className="flex gap-5 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  pathname === link.href
                    ? "font-medium underline underline-offset-4"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
