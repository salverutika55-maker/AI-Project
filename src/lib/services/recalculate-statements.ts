import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

/**
 * Recalculates and replaces the stored PNL values for a specific client and fiscal year.
 * This guarantees that stale mapping remnants are wiped completely.
 * 
 * @param clientId The database ID of the client
 * @param targetYear The starting calendar year of the FY (e.g. 2026 for FY 2026-27)
 */
export async function recalculatePNLValues(clientId: string, targetYear: number) {
  console.log(`[Recalculator] Recalculating PNL values for client ${clientId}, year ${targetYear}`);

  const clientWithMappings = await prisma.client.findUnique({
    where: { id: clientId },
    include: { pnlMappings: true }
  });

  if (!clientWithMappings) {
    throw new Error("Client not found");
  }

  // 1. Fetch Vouchers for the Target Year
  const vouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      date: {
        gte: new Date(`${targetYear}-04-01`),
        lt: new Date(`${targetYear + 1}-04-01`),
      }
    },
    include: {
      lines: {
        include: {
          ledger: true
        }
      }
    }
  });

  // 2. Aggregate Monthly Data by Ledger
  const monthlyData: Record<string, Record<string, number>> = {};
  const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (const v of vouchers) {
    const actualMonthStr = MONTH_SHORT_NAMES[v.date.getUTCMonth()];
    if (!monthlyData[actualMonthStr]) monthlyData[actualMonthStr] = {};

    for (const line of v.lines) {
      if (!line.ledger?.name) continue;
      
      // Exclude soft-deleted/deleted ledgers
      if (line.ledger.sourceStatus === "deleted" || !line.ledger.isActive) continue;

      const ledgerName = line.ledger.name;
      if (!monthlyData[actualMonthStr][ledgerName]) monthlyData[actualMonthStr][ledgerName] = 0;

      // Debits are negative (expenses), Credits are positive (revenue)
      const amt = line.entryType === "DEBIT" ? -line.amount : line.amount;
      monthlyData[actualMonthStr][ledgerName] += amt;
    }
  }

  // 3. WIPE existing PNLValues for this client and target fiscal year first to prevent ghost balances
  // We wipe the whole FY span to ensure clean slate mapping reconciliation.
  await prisma.pNLValue.deleteMany({
    where: {
      clientId,
      OR: [
        { year: targetYear, month: { notIn: ["Jan", "Feb", "Mar"] } },
        { year: targetYear + 1, month: { in: ["Jan", "Feb", "Mar"] } }
      ]
    }
  });

  // 4. Map and Save to PNLValue
  for (const [mShort, accounts] of Object.entries(monthlyData)) {
    const syncYearToSave = ["Jan", "Feb", "Mar"].includes(mShort) ? targetYear + 1 : targetYear;
    const headBalances: Record<string, number> = {};

    for (const m of clientWithMappings.pnlMappings) {
      const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
      let balance = 0;

      for (const alias of aliases) {
        const exactMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase() === alias);
        if (exactMatchKey) {
          balance += accounts[exactMatchKey];
        } else {
          const fuzzyMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase().includes(alias));
          if (fuzzyMatchKey) balance += accounts[fuzzyMatchKey];
        }
      }

      if (balance !== 0) {
        headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + Math.abs(balance);
      }
    }

    const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
      clientId,
      headName,
      month: mShort,
      year: syncYearToSave,
      amount: encrypt(balance.toString())
    }));

    if (finalEntries.length > 0) {
      await prisma.pNLValue.createMany({ data: finalEntries });
    }
  }

  console.log(`[Recalculator] Successfully recalculated PNL values for client ${clientId}`);
}
