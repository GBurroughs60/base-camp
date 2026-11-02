import { getQuickBooksConnectionStatus } from "@/app/actions/quickbooks";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "That connection attempt couldn't be verified -- please try again.",
  token_exchange_failed: "QuickBooks didn't accept that connection attempt -- please try again.",
  access_denied: "The QuickBooks connection was cancelled.",
};

// Admin settings page -- no other page in Base Camp needs to know whether
// QuickBooks is connected, so this is the one place that reads
// quickbooks_connection's status and the one place that can kick off (or
// redo) the OAuth flow via /api/quickbooks/connect. See Nav.tsx's
// adminLinks for why this sits alongside Candidates/Revenue rather than in
// the main nav.
export default async function QuickBooksSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected: justConnected, error } = await searchParams;
  const status = await getQuickBooksConnectionStatus();

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-3xl font-medium mb-1">QuickBooks</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Connects Base Camp to QuickBooks Online so commission invoices can be created and tracked
        automatically.
      </p>

      {justConnected && (
        <div className="mb-4 rounded-lg border border-emerald-600/20 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          QuickBooks connected successfully.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-600/20 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {ERROR_MESSAGES[error] ?? "Something went wrong connecting QuickBooks -- please try again."}
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm">
        {status.connected ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <h2 className="font-medium">Connected</h2>
            </div>
            <dl className="text-sm space-y-2 mb-6">
              <div className="flex justify-between">
                <dt className="text-black/60 dark:text-white/60">Company (realm ID)</dt>
                <dd className="font-mono">{status.realmId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-black/60 dark:text-white/60">Connected</dt>
                <dd>{status.connectedAt ? new Date(status.connectedAt).toLocaleString() : "--"}</dd>
              </div>
            </dl>
            <p className="text-xs text-black/50 dark:text-white/50 mb-4">
              Access tokens refresh automatically. Reconnect only if invoices start failing with an
              authorization error, or to point Base Camp at a different QuickBooks company.
            </p>
            <a
              href="/api/quickbooks/connect"
              className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Reconnect QuickBooks
            </a>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block h-2 w-2 rounded-full bg-black/20 dark:bg-white/20" />
              <h2 className="font-medium">Not connected</h2>
            </div>
            <p className="text-sm text-black/60 dark:text-white/60 mb-4">
              Before connecting, make sure a &quot;Booking Commission&quot; item exists in QuickBooks
              (Sales &gt; Products and services) and that the app&apos;s client ID/secret are set as
              Vercel environment variables.
            </p>
            <a
              href="/api/quickbooks/connect"
              className="inline-flex items-center rounded-md bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Connect QuickBooks
            </a>
          </>
        )}
      </div>
    </div>
  );
}
