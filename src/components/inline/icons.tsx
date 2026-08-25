export function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M11.5 2.5a1.5 1.5 0 0 1 2.121 2.121L6.5 11.743 3.5 12.5l.757-3L11.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 6.5 8 10l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="m12.5 12.5-2.4-2.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Filled when `active` (the current primary), outlined otherwise --
 * used as the "make primary" control on additional-association lists. */
export function StarIcon({
  className,
  active,
}: {
  className?: string;
  active?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill={active ? "currentColor" : "none"}
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 1.75l1.85 3.75 4.15.6-3 2.93.71 4.13L8 11.25l-3.71 1.9.71-4.13-3-2.93 4.15-.6L8 1.75Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
