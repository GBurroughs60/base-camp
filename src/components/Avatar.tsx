"use client";

import { useState } from "react";

// Shared circular avatar: an artist's photo_url when there is one and it
// actually loads, initials otherwise. Needed in three places now (the
// Dashboard's roster strip, and its Upcoming/Recent row thumbnails) --
// each previously had no avatar at all, so there's no prior convention to
// match beyond InlineImageField's own img-tag + onError pattern, which
// this mirrors.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src?: string | null;
  name: string;
  /** Square side length in pixels -- it's rendered as a circle. */
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = !!src && !broken;

  return (
    <span
      style={{ width: size, height: size }}
      className={
        "relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden " +
        "bg-black/[.06] dark:bg-white/[.08] text-black/50 dark:text-white/50 font-medium " +
        className
      }
    >
      {showImage ? (
        // Pasted links, not local assets -- next/image can't optimize an
        // arbitrary external host without allow-listing it up front. Same
        // reasoning as InlineImageField.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt=""
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}>{initials(name)}</span>
      )}
    </span>
  );
}
