import { prisma } from "@/lib/prisma";

const ASSET_GROUP_NAMES = new Set([
  "Non-Current Assets",
  "Current Assets",
  "Fixed Assets",
  "Investments",
  "Sundry Debtors",
  "Cash-In-Hand",
  "Bank Accounts",
  "Closing Stock",
  "Deposits (Assets)",
  "Short Term Loan & Advance",
  "Trade Receivable"
]);

const LIABILITY_GROUP_NAMES = new Set([
  "Owner's Funds",
  "Non-Current Liabilities",
  "Current Liabilities",
  "Capital Account",
  "Suspense A/c",
  "Sundry Creditors",
  "Duties & Taxes",
  "Loans (Liability)",
  "Secured Loans",
  "Unsecured Loans",
  "Primary",
  "Reserves & Surplus",
  "Trade Payable"
]);

const BS_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const BS_FULL_MONTHS = ["Opening", ...BS_MONTHS];
const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface BalanceSheetLedgerAuditRow {
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  subGroupName: string;
  subHeadName: string;
  mainGroup: "Assets" | "Liabilities";
  nature: string;
  openingBalance: number;
  preFYDebit: number;
  preFYCredit: number;
  fyDebit: number;
  fyCredit: number;
  closingBalance: number;
  mapped: boolean;
  includedInBS: boolean;
  isPnL: boolean;
  reasonExcluded?: string;
  duplicateName?: boolean;
}

export interface BalanceSheetSubheadSummary {
  subHeadName: string;
  groupName: string;
  mainGroup: "Assets" | "Liabilities";
  mappedLedgersCount: number;
  includedLedgersCount: number;
  mappedLedgerIds: string[];
  missingLedgerIds: string[];
  ledgerTotal: number;
  displayedTotal: number;
  difference: number;
}

export interface BalanceSheetGroupSummary {
  groupName: string;
  mainGroup: "Assets" | "Liabilities";
  subheads: BalanceSheetSubheadSummary[];
  ledgerTotal: number;
  displayedTotal: number;
  difference: number;
}

export interface BalanceSheetReconciliationResult {
  totalMappedLedgers: number;
  totalIncludedLedgers: number;
  totalMissingLedgers: number;
  mappedLedgerIds: string[];
  includedLedgerIds: string[];
  missingLedgerIds: string[];
  duplicateLedgerNames: string[];
  subheadSummaries: BalanceSheetSubheadSummary[];
  groupSummaries: BalanceSheetGroupSummary[];
  ledgerAuditRows: BalanceSheetLedgerAuditRow[];
  reconciled: boolean;
}

export async function buildBalanceSheetReconciliation(clientId: string, year: number) {
  const mappings = await prisma.unifiedLedgerMapping.findMany({
    where: { clientId, statementType: "BS" }
  });

  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId, isActive: true }
  });

  const voucherLines = await prisma.normalizedVoucherLine.findMany({
    where: { voucher: { clientId } },
    select: {
      ledgerId: true,
      amount: true,
      entryType: true,
      voucher: { select: { date: true } }
    }
  });

  const mappedLedgerNames = new Set(mappings.map(m => m.softwareLedgerName.trim().toLowerCase()));
  const nameCounts: Record<string, number> = {};
  ledgers.forEach(l => {
    const key = l.name.trim().toLowerCase();
    nameCounts[key] = (nameCounts[key] || 0) + 1;
  });

  const preFYMovements: Record<string, { debit: number; credit: number }> = {};
  const monthlyMovements: Record<string, Record<string, { debit: number; credit: number }>> = {};
  const targetFYStart = new Date(`${year}-04-01T00:00:00.000Z`);
  const targetFYEnd = new Date(`${year + 1}-03-31T23:59:59.999Z`);

  voucherLines.forEach(vl => {
    const d = new Date(vl.voucher.date);
    if (d < targetFYStart) {
      if (!preFYMovements[vl.ledgerId]) preFYMovements[vl.ledgerId] = { debit: 0, credit: 0 };
      if (vl.entryType === "DEBIT") preFYMovements[vl.ledgerId].debit += vl.amount;
      else preFYMovements[vl.ledgerId].credit += vl.amount;
    }

    if (d >= targetFYStart && d <= targetFYEnd) {
      const mName = MONTH_SHORT_NAMES[d.getUTCMonth()];
      if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
      if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };
      if (vl.entryType === "DEBIT") monthlyMovements[vl.ledgerId][mName].debit += vl.amount;
      else monthlyMovements[vl.ledgerId][mName].credit += vl.amount;
    }
  });

  const ledgerAuditRows: BalanceSheetLedgerAuditRow[] = [];

  const bySubhead: Record<string, BalanceSheetSubheadSummary> = {};
  const byGroup: Record<string, BalanceSheetGroupSummary> = {};

  const includedLedgerIds: string[] = [];
  const mappedLedgerIds: string[] = [];
  const missingLedgerIds: string[] = [];
  const duplicateLedgerNames: string[] = [];

  ledgers.forEach(ledger => {
    const key = ledger.name.trim().toLowerCase();
    if (nameCounts[key] > 1) duplicateLedgerNames.push(ledger.name);

    const mapping = mappings.find(m => m.softwareLedgerName.trim().toLowerCase() === key);
    const isPnL = ledger.name.toLowerCase().includes("profit & loss") || ledger.name.toLowerCase().includes("p&l");
    const mapped = !!mapping || isPnL;

    const groupName = mapping?.groupName || ledger.groupName;
    const subGroupName = mapping?.subGroupName || mapping?.groupName || ledger.groupName;
    const subHeadName = mapping?.subHeadName || subGroupName;
    const mainGroup = mapping
      ? LIABILITY_GROUP_NAMES.has(groupName)
        ? "Liabilities"
        : ASSET_GROUP_NAMES.has(groupName)
        ? "Assets"
        : ledger.nature === "CREDIT"
        ? "Liabilities"
        : "Assets"
      : isPnL
      ? "Liabilities"
      : ledger.nature === "CREDIT"
      ? "Liabilities"
      : "Assets";

    const preFY = preFYMovements[ledger.id] || { debit: 0, credit: 0 };
    const fyMvmt = { debit: 0, credit: 0 };
    BS_MONTHS.forEach(m => {
      if (monthlyMovements[ledger.id] && monthlyMovements[ledger.id][m]) {
        fyMvmt.debit += monthlyMovements[ledger.id][m].debit;
        fyMvmt.credit += monthlyMovements[ledger.id][m].credit;
      }
    });

    let openingBalance = ledger.openingBalance;
    if (openingBalance === 0) {
      if (ledger.closingBalance !== 0) {
        openingBalance = mainGroup === "Assets"
          ? ledger.closingBalance - fyMvmt.debit + fyMvmt.credit
          : ledger.closingBalance - fyMvmt.credit + fyMvmt.debit;
      } else {
        openingBalance = mainGroup === "Assets"
          ? preFY.debit - preFY.credit
          : preFY.credit - preFY.debit;
      }
    }

    const closingBalance = mainGroup === "Assets"
      ? openingBalance + fyMvmt.debit - fyMvmt.credit
      : openingBalance + fyMvmt.credit - fyMvmt.debit;

    const includedInBS = mapped;
    const reasonExcluded = mapped ? undefined : "Not mapped to Balance Sheet";

    if (mapped) mappedLedgerIds.push(ledger.id);
    if (includedInBS) includedLedgerIds.push(ledger.id);
    if (mapped && !includedInBS) missingLedgerIds.push(ledger.id);

    const row: BalanceSheetLedgerAuditRow = {
      ledgerId: ledger.id,
      ledgerName: ledger.name,
      groupName,
      subGroupName,
      subHeadName,
      mainGroup,
      nature: ledger.nature,
      openingBalance,
      preFYDebit: preFY.debit,
      preFYCredit: preFY.credit,
      fyDebit: fyMvmt.debit,
      fyCredit: fyMvmt.credit,
      closingBalance,
      mapped,
      includedInBS,
      isPnL,
      reasonExcluded,
      duplicateName: nameCounts[key] > 1
    };

    ledgerAuditRows.push(row);

    const subheadKey = `${mainGroup}|||${subHeadName}`;
    if (!bySubhead[subheadKey]) {
      bySubhead[subheadKey] = {
        subHeadName,
        groupName,
        mainGroup,
        mappedLedgersCount: 0,
        includedLedgersCount: 0,
        mappedLedgerIds: [],
        missingLedgerIds: [],
        ledgerTotal: 0,
        displayedTotal: 0,
        difference: 0
      };
    }

    const subhead = bySubhead[subheadKey];
    if (mapped) {
      subhead.mappedLedgersCount += 1;
      subhead.mappedLedgerIds.push(ledger.id);
      if (!includedInBS) subhead.missingLedgerIds.push(ledger.id);
    }
    if (includedInBS) {
      subhead.includedLedgersCount += 1;
      subhead.ledgerTotal += closingBalance;
    }

    const groupKey = `${mainGroup}|||${groupName}`;
    if (!byGroup[groupKey]) {
      byGroup[groupKey] = {
        groupName,
        mainGroup,
        subheads: [],
        ledgerTotal: 0,
        displayedTotal: 0,
        difference: 0
      };
    }
    byGroup[groupKey].ledgerTotal += includedInBS ? closingBalance : 0;
  });

  const subheadSummaries = Object.values(bySubhead).map(summary => {
    summary.difference = Math.abs(summary.displayedTotal - summary.ledgerTotal);
    return summary;
  });

  Object.values(byGroup).forEach(group => {
    group.subheads = subheadSummaries.filter(sh => sh.groupName === group.groupName && sh.mainGroup === group.mainGroup);
    group.displayedTotal = group.subheads.reduce((sum, sh) => sum + sh.displayedTotal, 0);
    group.ledgerTotal = group.subheads.reduce((sum, sh) => sum + sh.ledgerTotal, 0);
    group.difference = Math.abs(group.displayedTotal - group.ledgerTotal);
  });

  const reconciled = missingLedgerIds.length === 0;

  return {
    totalMappedLedgers: mappedLedgerIds.length,
    totalIncludedLedgers: includedLedgerIds.length,
    totalMissingLedgers: missingLedgerIds.length,
    mappedLedgerIds,
    includedLedgerIds,
    missingLedgerIds,
    duplicateLedgerNames: Array.from(new Set(duplicateLedgerNames)),
    subheadSummaries,
    groupSummaries: Object.values(byGroup),
    ledgerAuditRows,
    reconciled
  } as BalanceSheetReconciliationResult;
}
