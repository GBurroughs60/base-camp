// Shared presentational primitives for play-creation forms -- originally
// defined only inside app/book/BookForm.tsx (the public offer-intake page),
// pulled out here so the internal "New Play" modal (NewPlayModal.tsx) can
// render the same section-card layout, field wrapper, and toggle-chip style
// without copy-pasting the markup and silently drifting from the public
// form's look over time. Pure presentational -- no hooks, no state -- so
// either a client or server component can render them.

export const inputClass =
  "border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-black/50 dark:text-white/50">{label}</span>
      {children}
    </label>
  );
}

export function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`px-3 py-1 text-sm rounded-full border transition-colors ${
        checked
          ? "bg-ridge-orange text-white border-transparent"
          : "border-black/15 dark:border-white/15 text-black/50 dark:text-white/50 hover:border-ridge-orange/50"
      }`}
    >
      {label}: {checked ? "Yes" : "No"}
    </button>
  );
}

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm flex flex-col gap-3">
      <h2 className="font-medium text-sm">{title}</h2>
      {children}
    </div>
  );
}
