import { prisma } from "@/lib/prisma";

const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const FULL_MONTHS = ["Opening", ...FY_MONTHS];
const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  "Trade Receivable",
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
  "Trade Payable",
]);

const DEFAULT_STRUCTURE: Record<string, Record<string, Record<string, Record<string, never>>>> = {
  Liabilities: {
    "Owner's Funds": {
      "Capital Account": {},
      "Reserves & Surplus": {},
      Drawing: {},
    },
    "Non-Current Liabilities": {
      "Secured Loans": {},
      "Unsecured Loans": {},
    },
    "Current Liabilities": {
      "Short Term Borrowing": {},
      "Duties & Taxes": {},
      "Suspense A/c": {},
      "Trade Payable": {},
      Provisions: {},
      "Other Current Liabilities": {},
    },
  },
  Assets: {
    "Non-Current Assets": {
      "Fixed Assets": {},
      Investments: {},
    },
    "Current Assets": {
      "Closing Stock": {},
      "Trade Receivable": {},
      "Cash-In-Hand": {},
      "Bank Accounts": {},
      "Deposits (Assets)": {},
      "Short Term Loan & Advance": {},
      "Other Current Assets": {},
    },
    "Branch Account": {},
  },
};

export type LedgerMonthTrace = {
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

export type BalanceSheetLedgerTrace = {
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  subGroupName: string;
  subHeadName: string;
  mainGroup: "Assets" | "Liabilities";
  nature: string;
  openingSource: "ledger_opening" | "derived_from_closing" | "derived_from_pre_fy";
  dbOpeningBalance: number;
  dbClosingBalance: number;
  monthTraces: Record<string, LedgerMonthTrace>;
};

export type BalanceSheetSubheadDiagnostic = {
  mainGroup: "Assets" | "Liabilities";
  groupName: string;
  subHeadName: string;
  mappedLedgersCount: number;
  mappedLedgerNames: string[];
  calculatedTotal: number;
  displayedTotal: number;
  variance: number;
};

export type BalanceSheetSubheadMonthAudit = {
  mainGroup: "Assets" | "Liabilities";
  groupName: string;
  subHeadName: string;
  period: string;
  expectedTotal: number;
  displayedTotal: number;
  variance: number;
};

function mappingKey(value: string) {
  return value
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function safeNum(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeOpeningForFormula(openingAmount: number, openingNature: string, mainGroup: "Assets" | "Liabilities"): number {
  const absAmt = Math.abs(openingAmount);
  if (mainGroup === "Assets") {
    return openingNature === "CREDIT" ? -absAmt : absAmt;
  } else {
    return openingNature === "DEBIT" ? -absAmt : absAmt;
  }
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  const cleaned = (value || "")
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function resolveMainGroup(groupName: string, nature: string): "Assets" | "Liabilities" {
  if (LIABILITY_GROUP_NAMES.has(groupName)) return "Liabilities";
  if (ASSET_GROUP_NAMES.has(groupName)) return "Assets";
  return nature === "CREDIT" ? "Liabilities" : "Assets";
}

function cloneDefaultStructure() {
  return JSON.parse(JSON.stringify(DEFAULT_STRUCTURE));
}

export async function buildBalanceSheetTrace(clientId: string, year: number) {
  const [mappings, ledgers, voucherLines] = await Promise.all([
    prisma.unifiedLedgerMapping.findMany({
      where: { clientId, statementType: "BS" },
    }),
    prisma.normalizedLedger.findMany({
      where: { clientId, isActive: true },
    }),
    prisma.normalizedVoucherLine.findMany({
      where: { voucher: { clientId } },
      select: {
        ledgerId: true,
        amount: true,
        entryType: true,
        voucher: { select: { date: true } },
      },
    }),
  ]);

  const targetFYStart = new Date(`${year}-04-01T00:00:00.000Z`);
  const targetFYEnd = new Date(`${year + 1}-03-31T23:59:59.999Z`);

  const preFYMovements: Record<string, { debit: number; credit: number }> = {};
  const monthlyMovements: Record<string, Record<string, { debit: number; credit: number }>> = {};

  for (const vl of voucherLines) {
    const d = new Date(vl.voucher.date);
    if (d < targetFYStart) {
      if (!preFYMovements[vl.ledgerId]) preFYMovements[vl.ledgerId] = { debit: 0, credit: 0 };
      if (vl.entryType === "DEBIT") {
        preFYMovements[vl.ledgerId].debit += safeNum(vl.amount);
      } else {
        preFYMovements[vl.ledgerId].credit += safeNum(vl.amount);
      }
      continue;
    }

    if (d > targetFYEnd) continue;

    const mName = MONTH_SHORT_NAMES[d.getMonth()];
    if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
    if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };

    if (vl.entryType === "DEBIT") {
      monthlyMovements[vl.ledgerId][mName].debit += safeNum(vl.amount);
    } else {
      monthlyMovements[vl.ledgerId][mName].credit += safeNum(vl.amount);
    }
  }

  const mappingByLedger = new Map<string, (typeof mappings)[number]>();
  for (const m of mappings) {
    mappingByLedger.set(mappingKey(m.softwareLedgerName), m);
  }

  const missingMappedLedgerNames = mappings
    .filter((m) => !ledgers.some((l) => mappingKey(l.name) === mappingKey(m.softwareLedgerName)))
    .map((m) => m.softwareLedgerName);

  const ledgerTraces: BalanceSheetLedgerTrace[] = [];

  for (const ledger of ledgers) {
    const mapping = mappingByLedger.get(mappingKey(ledger.name));
    if (!mapping) continue;

    const groupName = cleanLabel(mapping.groupName, cleanLabel(ledger.groupName, "Unclassified"));
    const subHeadName = cleanLabel(mapping.subHeadName || mapping.subGroupName || mapping.groupName, groupName);
    const mainGroup = resolveMainGroup(groupName, ledger.nature);

    const fyMovement = { debit: 0, credit: 0 };
    for (const month of FY_MONTHS) {
      const mv = monthlyMovements[ledger.id]?.[month] || { debit: 0, credit: 0 };
      fyMovement.debit += safeNum(mv.debit);
      fyMovement.credit += safeNum(mv.credit);
    }

    const preFY = preFYMovements[ledger.id] || { debit: 0, credit: 0 };

    let running = safeNum(ledger.openingBalance);
    let openingSource: "ledger_opening" | "derived_from_closing" | "derived_from_pre_fy" = "ledger_opening";

    // 1. Sign opening balance relative to the locked formula using normalizeOpeningForFormula
    if (running !== 0) {
      running = normalizeOpeningForFormula(running, ledger.nature, mainGroup);
    } else {
      // 2. Derive from closing balance if opening is 0 but closing is non-zero
      let signedClosingBal = safeNum(ledger.closingBalance);
      if (signedClosingBal !== 0) {
        signedClosingBal = normalizeOpeningForFormula(signedClosingBal, ledger.nature, mainGroup);
        running = mainGroup === "Assets"
          ? signedClosingBal - fyMovement.debit + fyMovement.credit
          : signedClosingBal - fyMovement.credit + fyMovement.debit;
        openingSource = "derived_from_closing";
      } else {
        running = 0;
        openingSource = "ledger_opening";
      }
    }

    const monthTraces: Record<string, LedgerMonthTrace> = {
      Opening: {
        opening: running,
        debit: 0,
        credit: 0,
        closing: running,
      },
    };

    for (const month of FY_MONTHS) {
      const mv = monthlyMovements[ledger.id]?.[month] || { debit: 0, credit: 0 };
      const opening = running;
      const debit = safeNum(mv.debit);
      const credit = safeNum(mv.credit);
      
      // Apply locked formulas exactly
      const closing = mainGroup === "Assets"
        ? opening + debit - credit
        : opening + credit - debit;
        
      monthTraces[month] = { opening, debit, credit, closing };
      running = closing;
    }

    ledgerTraces.push({
      ledgerId: ledger.id,
      ledgerName: ledger.name,
      groupName,
      subGroupName: subHeadName,
      subHeadName,
      mainGroup,
      nature: ledger.nature,
      dbOpeningBalance: safeNum(ledger.openingBalance),
      dbClosingBalance: safeNum(ledger.closingBalance),
      openingSource,
      monthTraces,
    });
  }

  const structure = cloneDefaultStructure();
  for (const row of ledgerTraces) {
    if (!structure[row.mainGroup]) structure[row.mainGroup] = {};
    if (!structure[row.mainGroup][row.groupName]) structure[row.mainGroup][row.groupName] = {};
    if (!structure[row.mainGroup][row.groupName][row.subHeadName]) {
      structure[row.mainGroup][row.groupName][row.subHeadName] = {};
    }
  }

  const dataNodes: Array<{
    id: string;
    ledgerId: string;
    period: string;
    mainGroup: "Assets" | "Liabilities";
    groupName: string;
    subGroupName: string;
    subHeadName: string;
    ledgerName: string;
    amount: number;
    nature: string;
    opening: number;
    debit: number;
    credit: number;
    closing: number;
  }> = [];

  for (const row of ledgerTraces) {
    for (const month of FULL_MONTHS) {
      const trace = row.monthTraces[month];
      dataNodes.push({
        id: `${row.ledgerId}-${month}`,
        ledgerId: row.ledgerId,
        period: month,
        mainGroup: row.mainGroup,
        groupName: row.groupName,
        subGroupName: row.subHeadName,
        subHeadName: row.subHeadName,
        ledgerName: row.ledgerName,
        amount: trace.closing,
        nature: row.nature,
        opening: trace.opening,
        debit: trace.debit,
        credit: trace.credit,
        closing: trace.closing,
      });
    }
  }

  const latestMonth = "Mar";
  const bySubhead = new Map<string, BalanceSheetSubheadDiagnostic>();

  for (const row of ledgerTraces) {
    const key = `${row.mainGroup}|||${row.groupName}|||${row.subHeadName}`;
    const existing = bySubhead.get(key) || {
      mainGroup: row.mainGroup,
      groupName: row.groupName,
      subHeadName: row.subHeadName,
      mappedLedgersCount: 0,
      mappedLedgerNames: [],
      calculatedTotal: 0,
      displayedTotal: 0,
      variance: 0,
    };

    existing.mappedLedgersCount += 1;
    existing.mappedLedgerNames.push(row.ledgerName);
    existing.calculatedTotal += row.monthTraces[latestMonth]?.closing || 0;
    bySubhead.set(key, existing);
  }

  for (const node of dataNodes) {
    if (node.period !== latestMonth) continue;
    const key = `${node.mainGroup}|||${node.groupName}|||${node.subHeadName}`;
    const existing = bySubhead.get(key);
    if (!existing) continue;
    existing.displayedTotal += safeNum(node.amount);
  }

  const subheadDiagnostics = Array.from(bySubhead.values()).map((d) => ({
    ...d,
    variance: Math.abs(d.displayedTotal - d.calculatedTotal),
  }));

  const subheadMonthAudit: BalanceSheetSubheadMonthAudit[] = [];
  for (const summary of subheadDiagnostics) {
    for (const period of FULL_MONTHS) {
      const expectedTotal = ledgerTraces
        .filter(
          (row) =>
            row.mainGroup === summary.mainGroup &&
            row.groupName === summary.groupName &&
            row.subHeadName === summary.subHeadName
        )
        .reduce((sum, row) => sum + safeNum(row.monthTraces[period]?.closing), 0);

      const displayedTotal = dataNodes
        .filter(
          (node) =>
            node.mainGroup === summary.mainGroup &&
            node.groupName === summary.groupName &&
            node.subHeadName === summary.subHeadName &&
            node.period === period
        )
        .reduce((sum, node) => sum + safeNum(node.amount), 0);

      subheadMonthAudit.push({
        mainGroup: summary.mainGroup,
        groupName: summary.groupName,
        subHeadName: summary.subHeadName,
        period,
        expectedTotal,
        displayedTotal,
        variance: Math.abs(displayedTotal - expectedTotal),
      });
    }
  }

  const openingSourceSummary = {
    ledgerOpening: ledgerTraces.filter((row) => row.openingSource === "ledger_opening").length,
    derivedFromClosing: ledgerTraces.filter((row) => row.openingSource === "derived_from_closing").length,
    derivedFromPreFY: ledgerTraces.filter((row) => row.openingSource === "derived_from_pre_fy").length,
  };

  const totalsByMainGroup = {
    Assets: dataNodes
      .filter((n) => n.mainGroup === "Assets" && n.period === latestMonth)
      .reduce((sum, n) => sum + safeNum(n.amount), 0),
    Liabilities: dataNodes
      .filter((n) => n.mainGroup === "Liabilities" && n.period === latestMonth)
      .reduce((sum, n) => sum + safeNum(n.amount), 0),
  };

  return {
    mappings,
    ledgers,
    ledgerTraces,
    dataNodes,
    structure,
    subheadDiagnostics,
    subheadMonthAudit,
    totalsByMainGroup,
    openingSourceSummary,
    missingMappedLedgerNames,
  };
}
