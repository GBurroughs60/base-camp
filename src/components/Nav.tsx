"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChevronIcon } from "./inline/icons";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/action-items", label: "Action List" },
  { href: "/artists", label: "Artists" },
  { href: "/contacts", label: "Contacts" },
  { href: "/companies", label: "Venues" },
  { href: "/events", label: "Events" },
  { href: "/plays", label: "Plays" },
];

// Gated behind isAdmin below (2026-11-09, per Greg: "truly treat that as
// a second, higher-level permission set for admins only") -- see
// src/lib/admin.ts. Hiding the link here is the UX half; each of these
// four routes also calls requireAdmin() itself (candidates/page.tsx,
// revenue/page.tsx, settings/quickbooks/page.tsx, settings/team/page.tsx),
// which is the half that actually matters, since a hidden link doesn't
// stop someone from typing the URL directly.
const adminLinks = [
  { href: "/candidates", label: "Candidates" },
  { href: "/pending-review", label: "Pending Review" },
  { href: "/revenue", label: "Revenue" },
  { href: "/settings/quickbooks", label: "QuickBooks" },
  { href: "/settings/team", label: "Team" },
];

// Keyed the same as counts/adminLinks hrefs -- currently only
// /settings/quickbooks sets one, but any link can opt in by having its
// href show up in the statusDots map passed down from layout.tsx.
type DotStatus = "connected" | "warning" | "disconnected";

const DOT_COLOR: Record<DotStatus, string> = {
  connected: "bg-emerald-500",
  warning: "bg-amber-500",
  disconnected: "bg-red-500",
};

const DOT_LABEL: Record<DotStatus, string> = {
  connected: "Connected",
  warning: "Connected -- needs attention soon",
  disconnected: "Not connected",
};

export default function Nav({
  counts,
  isAdmin,
  statusDots,
}: {
  counts?: Record<string, number>;
  isAdmin: boolean;
  statusDots?: Record<string, DotStatus>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  // Mobile-only -- below the md breakpoint the sidebar is an off-canvas
  // drawer (closed by default) with a small edge tab to open/close it,
  // per Greg (2026-10-19): "include a hide/expand arrow... on the left
  // side nav bar" after finding the always-visible w-64 sidebar unusable
  // on his phone. At md and up, "md:translate-x-0" below always wins
  // regardless of this state, so desktop's existing always-visible
  // behavior is unchanged -- this toggle has no effect there, so its
  // controls are hidden there too (md:hidden) rather than shown inert.
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function renderLink(link: { href: string; label: string }) {
    const active = pathname === link.href;
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={() => setOpen(false)}
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
        <span className="pl-2 flex-1 flex items-center gap-2">
          {link.label}
          {statusDots?.[link.href] && (
            <span
              title={DOT_LABEL[statusDots[link.href]]}
              className={
                "inline-block h-1.5 w-1.5 rounded-full shrink-0 " + DOT_COLOR[statusDots[link.href]]
              }
            />
          )}
        </span>
        {counts?.[link.href] !== undefined && (
          <span
            className={
              "text-xs tabular-nums pr-1 " +
              (active ? "text-white/70" : "text-white/35 group-hover:text-white/60")
            }
          >
            {counts[link.href]}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      {/* Mobile-only expand tab -- sits on the viewport's left edge while
          the drawer is closed. Hidden at md+, where the sidebar is always
          visible and this control would have nothing to do. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="md:hidden fixed top-4 left-0 z-50 flex items-center justify-center w-7 h-10 rounded-r-full bg-ridge-ink text-white/80 shadow-lg active:bg-ridge-ink/90"
        >
          <ChevronIcon className="w-3.5 h-3.5 -rotate-90" />
        </button>
      )}

      {/* Backdrop -- tap outside the open drawer to close it. */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={
          "w-64 shrink-0 fixed inset-y-0 left-0 z-50 h-screen bg-ridge-ink text-white flex flex-col transition-transform duration-200 " +
          (open ? "translate-x-0" : "-translate-x-full") +
          " md:translate-x-0 md:static md:sticky md:top-0"
        }
      >
      <div className="px-5 pt-6 pb-5 border-b border-white/10 flex items-center gap-3">
        <Image
          src="/brand/ridge-light-icon.png"
          alt=""
          width={36}
          height={22}
          className="shrink-0"
          priority
        />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-medium tracking-tight leading-tight truncate">
            Base Camp
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 truncate">
            The Ridge Music Group
          </div>
        </div>
        {/* Mobile-only collapse tab -- same control, opposite state, kept
            inside the drawer's own header so it travels with it. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
          className="md:hidden shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ChevronIcon className="w-3.5 h-3.5 rotate-90" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col overflow-y-auto">
        <div className="flex flex-col gap-0.5">{links.map(renderLink)}</div>

        {/* Admin area -- lower in the sidebar, visually separated, and now
            actually gated (see adminLinks' comment above) rather than just
            visually set apart. */}
        {isAdmin && (
          <div className="mt-auto pt-4 flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.14em] text-white/30">
              Admin
            </p>
            {adminLinks.map(renderLink)}
          </div>
        )}
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
    </>
  );
}
