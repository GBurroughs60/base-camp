import Image from "next/image";
import { getSettlementSummary, submitSettlement } from "@/app/actions/settlement";
import SettlementExpensesField from "@/components/inline/SettlementExpensesField";

// Public, unauthenticated page -- reached from the "Submit post-show
// report" link in the settlement-request email, by the artist (or their
// manager/rep) with no Base Camp login (see middleware.ts, which exempts
// /settle from the auth redirect). Deliberately a fill-then-submit page
// rather than a link that records anything on load: some corporate
// email/security tools pre-fetch every link in an inbound email to scan
// it, which would falsely trigger an empty submission if the link itself
// did the recording. Mirrors /approve/[token]/page.tsx's structure exactly.
export default async function SettlePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const summary = await getSettlementSummary(token);

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
          ) : summary.submittedAt ? (
            <AlreadySubmitted summary={summary} />
          ) : (
            <SettleForm token={token} summary={summary} error={error} />
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

function AlreadySubmitted({
  summary,
}: {
  summary: NonNullable<Awaited<ReturnType<typeof getSettlementSummary>>>;
}) {
  return (
    <>
      <h2 className="font-medium text-lg mb-1">Report received</h2>
      <p className="text-sm text-black/70 dark:text-white/70">
        {summary.submittedByName ? <>{summary.submittedByName} already submitted</> : "A report was already submitted"}
        {" "}for {summary.artistName} at {summary.venueLabel}
        {summary.submittedAt && (
          <> on {new Date(summary.submittedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</>
        )}
        . No further action is needed -- thanks for sending it in.
      </p>
    </>
  );
}

function formatMoney(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Shared "who's reporting?" control -- scoped to summary.responderOptions
// (the actual people the settlement-request email went to) plus a
// free-text fallback for anyone else. At least one is required; the server
// action redirects back with ?error=missing_responder if both are blank.
// Same pattern as ResponderFields in approve/[token]/page.tsx.
function ResponderFields({ options }: { options: { id: string; fullName: string }[] }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
        Who&apos;s reporting?
      </label>
      {options.length > 0 && (
        <select
          name="responderContactId"
          defaultValue=""
          className="w-full mb-1.5 rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors"
        >
          <option value="">Select your name…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.fullName}
            </option>
          ))}
        </select>
      )}
      <input
        type="text"
        name="responderOtherName"
        placeholder={options.length > 0 ? "Not listed? Type your name instead" : "Type your name"}
        className="w-full rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors"
      />
    </div>
  );
}

const textInput =
  "w-full rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors";

function SettleForm({
  token,
  summary,
  error,
}: {
  token: string;
  summary: NonNullable<Awaited<ReturnType<typeof getSettlementSummary>>>;
  error?: string;
}) {
  const rows: [string, string][] = [
    ["Venue", summary.venueLabel],
    ...(summary.location ? ([["Location", summary.location]] as [string, string][]) : []),
    ...(summary.showDate ? ([["Date", summary.showDate]] as [string, string][]) : []),
    ...(formatMoney(summary.guaranteeAmount)
      ? ([["Guarantee", formatMoney(summary.guaranteeAmount) as string]] as [string, string][])
      : []),
  ];

  return (
    <>
      <h2 className="font-medium text-lg mb-1">{summary.artistName}</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mb-4">
        Thanks for playing! A few quick questions about how the show went.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm mb-6">
        {rows.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-black/50 dark:text-white/50">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {error === "missing_responder" && (
        <p className="text-sm text-red-500 mb-3">
          Please let us know who&apos;s reporting before you submit.
        </p>
      )}

      <form action={submitSettlement.bind(null, token)} className="flex flex-col gap-3">
        <ResponderFields options={summary.responderOptions} />

        <div>
          <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
            Walkout -- what was the total amount you walked out with tonight, excluding merch?
          </label>
          <input type="number" step="0.01" name="walkoutAmount" placeholder="$0.00" className={textInput} />
        </div>

        <div>
          <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
            Gross merch sales
          </label>
          <input type="number" step="0.01" name="grossMerchSales" placeholder="$0.00" className={textInput} />
        </div>

        <div>
          <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
            Expenses (optional) -- anything you paid out of pocket day-of
          </label>
          <SettlementExpensesField initial={[]} />
        </div>

        <div>
          <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
            Other events in town that night (optional)
          </label>
          <input type="text" name="otherEventsInTown" placeholder="e.g. a competing show nearby" className={textInput} />
        </div>

        <div>
          <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
            Notes on the promoter/venue (optional)
          </label>
          <textarea name="promoterNotes" rows={3} className={textInput} />
        </div>

        <div>
          <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
            Would you play this venue again?
          </label>
          <select name="wouldPlayAgain" defaultValue="" className={textInput}>
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="with_reservations">With reservations</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-ridge-orange hover:bg-ridge-orange-dark text-white py-2 font-medium transition-colors mt-2"
        >
          Submit report
        </button>
      </form>
    </>
  );
}
