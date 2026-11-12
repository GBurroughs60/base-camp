"use client";

// The review gate itself (2026-11-12, per Greg -- docs/operations-accounting-plan.md
// section 9). Sits above The Ridge Revenue section on the Revenue page,
// not below it -- this is a to-do, not a report, same reasoning as why it
// also gets its own left-nav badge (Nav.tsx's alertCounts). Hides itself
// entirely once there's nothing pending, same as AgentCommissions does
// when its own list is empty.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Avatar from "./Avatar";
import {
  approveAndSendCommissionInvoice,
  approveAndSendAllCommissionInvoices,
  type PendingCommissionInvoiceRow,
} from "@/app/actions/commissionInvoices";

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "date TBD";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatReceivedDate(iso: string | null): string {
  if (!iso) return "not yet";
  return new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

export default function CommissionInvoiceApprovals({
  rows: initialRows,
}: {
  rows: PendingCommissionInvoiceRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bulkSummary, setBulkSummary] = useState<string | null>(null);

  if (rows.length === 0) return null;

  function approveOne(id: string) {
    setBusyId(id);
    setConfirmingId(null);
    setErrors((e) => ({ ...e, [id]: "" }));
    startTransition(async () => {
      const result = await approveAndSendCommissionInvoice(id);
      setBusyId(null);
      if (!result.ok) {
        setErrors((e) => ({ ...e, [id]: result.error }));
        return;
      }
      setRows((r) => r.filter((row) => row.id !== id));
      router.refresh();
    });
  }

  function approveAll() {
    setBusyAll(true);
    setConfirmingAll(false);
    setBulkSummary(null);
    startTransition(async () => {
      const result = await approveAndSendAllCommissionInvoices();
      setBusyAll(false);
      setRows([]); // re-synced by router.refresh() below regardless
      setBulkSummary(
        `Sent ${result.sent} of ${result.approved}.` +
          (result.blocked > 0 ? ` ${result.blocked} blocked -- check your email for details.` : "")
      );
      router.refresh();
    });
  }

  return (
    <section className="mb-8 rounded-xl border border-ridge-orange/40 bg-ridge-orange/5 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-display text-lg font-medium flex items-center gap-2">
          Commission invoices awaiting approval
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-ridge-orange text-white text-xs font-bold">
            {rows.length}
          </span>
        </h2>
        {confirmingAll ? (
          <span className="text-xs">
            Approve &amp; send all {rows.length}? This can&apos;t be undone.{" "}
            <button
              onClick={approveAll}
              disabled={pending}
              className="text-ridge-orange font-medium hover:underline underline-offset-4 disabled:opacity-50"
            >
              {busyAll ? "Sending…" : "Yes, send them"}
            </button>{" "}
            <button
              onClick={() => setConfirmingAll(false)}
              className="text-black/50 dark:text-white/50 hover:underline underline-offset-4"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingAll(true)}
            disabled={pending}
            className="text-xs font-medium border border-black/15 dark:border-white/15 rounded-md px-3 py-1.5 hover:border-ridge-orange/50 hover:text-ridge-orange disabled:opacity-50"
          >
            Approve &amp; send all
          </button>
        )}
      </div>

      {bulkSummary && (
        <p className="text-xs text-black/60 dark:text-white/60 mb-3">{bulkSummary}</p>
      )}

      <div className="divide-y divide-black/10 dark:divide-white/10">
        {rows.map((row) => (
          <div key={row.id} className="py-3 flex items-center gap-3">
            <Avatar src={row.artistPhotoUrl} name={row.artistName} size={32} />
            <div className="min-w-0 flex-1">
              <Link
                href={`/artists/${row.artistId}`}
                className="font-medium text-sm hover:underline underline-offset-4"
              >
                {row.artistName}
              </Link>
              <p className="text-xs text-black/50 dark:text-white/50 mt-0.5">
                {formatDate(row.showDate)} &middot; {row.venueLabel} &middot; Agent:{" "}
                {row.agentName ?? "Unassigned"}
              </p>
              <p className="text-xs text-black/40 dark:text-white/40 mt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓ Show report received {formatReceivedDate(row.settlementSubmittedAt)}
                </span>{" "}
                &middot; To {row.billingEmail ?? "no contact on file"}
                {row.managerNoticeCount > 0 &&
                  ` · ${row.managerNoticeCount} manager${row.managerNoticeCount === 1 ? "" : "s"} notified`}
              </p>
              {errors[row.id] && (
                <p className="text-xs text-red-500 mt-1">{errors[row.id]}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="font-display text-lg font-medium mb-1.5">{formatMoney(row.amount)}</p>
              {confirmingId === row.id ? (
                <span className="text-xs whitespace-nowrap">
                  Send {formatMoney(row.amount)} to {row.billingEmail ?? "?"}?{" "}
                  <button
                    onClick={() => approveOne(row.id)}
                    disabled={pending}
                    className="text-ridge-orange font-medium hover:underline underline-offset-4 disabled:opacity-50"
                  >
                    {busyId === row.id ? "Sending…" : "Yes, send it"}
                  </button>{" "}
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="text-black/50 dark:text-white/50 hover:underline underline-offset-4"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(row.id)}
                  disabled={pending}
                  className="bg-ridge-orange hover:bg-ridge-orange-dark text-white text-xs font-medium rounded-md px-3 py-1.5 disabled:opacity-50"
                >
                  Approve &amp; send
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
