// Shared chrome for the /legal/* pages (privacy policy, EULA) -- kept
// separate from each page so the two documents don't duplicate the same
// layout markup. Not a route itself (underscore-prefixed folder).
export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 bg-neutral-50 dark:bg-neutral-950 px-6 py-16">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-display text-3xl font-medium tracking-tight mb-1">{title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8">Base Camp — Ridge Music Group</p>
        <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-8 shadow-sm space-y-6 text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">{heading}</h2>
      {children}
    </section>
  );
}
