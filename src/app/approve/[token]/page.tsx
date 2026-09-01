import Image from "next/image";
import { getApprovalSummary, approveOffer, declineOffer } from "@/app/actions/approval";

// Public, unauthenticated page -- reached from the "Approve or Decline"
// link in the approval-request email, by someone outside Ridge with no
// Base Camp login (see middleware.ts, which exempts /approve from the
// auth redirect). Deliberately a confirm-then-click page rather than a
// link that approves on load: some corporate email/security tools
// pre-fetch every link in an inbound email to scan it, which would
// falsely trigger the action if the link itself did the approving.
export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const summary = await getApprovalSummary(token);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <Image
            src="/brand/ridge-dark-lockup.png"
            alt="The Ridge Music Group"
            width={112}
            height={112}
            className="mb-4 dark:hidden"
            priority
          />
          <Image
            src="/brand/ridge-light-lockup.png"
            alt="The Ridge Music Group"
            width={112}
            height={112}
            className="mb-4 hidden dark:block"
            priority
          />
          <h1 className="font-display text-2xl font-medium tracking-tight">Base Camp</h1>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm">
          {!summary ? (
            <InvalidLink />
          ) : summary.respondedAt ? (
            <AlreadyResponded summary={summary} />
          ) : (
            <RespondForm token={token} summary={summary} />
          )}
        </div>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <p className="text-sm text-black/70 dark:text-white/70">
      This link is invalid or has expired. If you think that&apos;s a mistake, reach out to your
      Ridge contact directly.
    </p>
  );
}

function AlreadyResponded({
  summary,
}: {
  summary: NonNullable<Awaited<ReturnType<typeof getApprovalSummary>>>;
}) {
  const approved = summary.status !== "declined";
  return (
    <>
      <h2 className="font-medium text-lg mb-1">{approved ? "Approved" : "Declined"}</h2>
      <p className="text-sm text-black/70 dark:text-white/70">
        You already responded to this offer for {summary.artistName} at {summary.venueLabel}
        {summary.respondedAt && (
          <> on {new Date(summary.respondedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</>
        )}
        . No further action is needed.
      </p>
    </>
  );
}

function formatMoney(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function RespondForm({
  token,
  summary,
}: {
  token: string;
  summary: NonNullable<Awaited<ReturnType<typeof getApprovalSummary>>>;
}) {
  const rows: [string, string][] = [
    ["Venue", summary.venueLabel],
    ...(summary.location ? ([["Location", summary.location]] as [string, string][]) : []),
    ...(summary.showDate ? ([["Date", summary.showDate]] as [string, string][]) : []),
    ...(formatMoney(summary.guaranteeAmount)
      ? ([["Guarantee", formatMoney(summary.guaranteeAmount) as string]] as [string, string][])
      : []),
    ...(summary.dealTerms ? ([["Deal terms", summary.dealTerms]] as [string, string][]) : []),
    ...(summary.capacity != null
      ? ([["Capacity", String(summary.capacity)]] as [string, string][])
      : []),
  ];

  return (
    <>
      <h2 className="font-medium text-lg mb-1">{summary.artistName}</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mb-4">
        Please review the details below and let us know.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm mb-6">
        {rows.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-black/50 dark:text-white/50">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <form action={approveOffer.bind(null, token)}>
        <button
          type="submit"
          className="w-full rounded-md bg-ridge-orange hover:bg-ridge-orange-dark text-white py-2 font-medium transition-colors"
        >
          Approve this offer
        </button>
      </form>

      <details className="mt-3">
        <summary className="text-sm text-black/60 dark:text-white/60 cursor-pointer select-none hover:text-black/80 dark:hover:text-white/80">
          Need to decline instead?
        </summary>
        <form action={declineOffer.bind(null, token)} className="mt-3 flex flex-col gap-2">
          <textarea
            name="note"
            placeholder="Add a note for Ridge (optional)"
            rows={3}
            className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors"
          />
          <button
            type="submit"
            className="w-full rounded-md border border-black/15 dark:border-white/15 py-2 font-medium text-sm hover:bg-black/[.03] dark:hover:bg-white/[.06] transition-colors"
          >
            Decline this offer
          </button>
        </form>
      </details>
    </>
  );
}
