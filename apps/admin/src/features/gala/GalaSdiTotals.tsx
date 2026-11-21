"use client";

import { useLocale } from "@/components/common/Providers";
import { Money } from "@/components/finance/ui";
import type { SdiStatus } from "@/lib/sdi-schemas";

/**
 * Phase 12B — reconciled Gala money by category (as reported by SDI). Ticket revenue, standalone Gala donations and donation lines
 * awaiting review are shown side by side and NEVER added together; no grand total is computed.
 */
export function GalaSdiTotals({ totals }: { totals: NonNullable<SdiStatus["galaTotals"]> }) {
  const { t } = useLocale();
  const x = t.sdi.totals;
  const tile = (label: string, value: React.ReactNode, sub: string, testid: string) => (
    <div className="rounded-xl border border-line p-3" data-testid={testid}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink">{x.title}</p>
      <div className={`grid gap-3 ${totals.galaDonationIntentsVerified ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}>
        {tile(x.tickets, <Money value={totals.ticketRevenue.net} currency={totals.currency} />, `${totals.ticketRevenue.orders} ${x.orders}`, "sdi-total-tickets")}
        {tile(x.donations, <Money value={totals.galaStandaloneDonations.amount} currency={totals.currency} />, `${totals.galaStandaloneDonations.gifts} ${x.gifts}`, "sdi-total-donations")}
        {totals.galaDonationIntentsVerified && tile(x.intents, <Money value={totals.galaDonationIntentsVerified.amount} currency={totals.currency} />, `${totals.galaDonationIntentsVerified.gifts} ${x.gifts}`, "sdi-total-intents")}
        {tile(x.review, <Money value={totals.donationRowsAwaitingReview.amount} currency={totals.currency} />, `${totals.donationRowsAwaitingReview.rows} ${x.rows}`, "sdi-total-review")}
      </div>
      <p className="mt-2 text-xs text-muted">{x.note}</p>
    </div>
  );
}
