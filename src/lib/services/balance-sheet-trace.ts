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
  "Cash-in-hand",
  "Bank Accounts",
  "Closing Stock",
  "Deposits (Asset)",
  "Loans & Advances (Asset)",
  "Trade Receivables",
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
  "Trade Payables",
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
      "Trade Payables": {},
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
      "Trade Receivables": {},
      "Cash-in-hand": {},
      "Bank Accounts": {},
      "Deposits (Asset)": {},
      "Loans & Advances (Asset)": {},
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

function mappingKey(value: string) {
  return value.trim().toLowerCase();
}

function safeNum(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
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

  const monthlyMovements: Record<string, Record<string, { debit: number; credit: number }>> = {};

  for (const vl of voucherLines) {
    const d = new Date(vl.voucher.date);
    if (d < targetFYStart || d > targetFYEnd) continue;

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

    const groupName = mapping.groupName.trim();
    const subHeadName = (mapping.subHeadName || mapping.subGroupName || mapping.groupName).trim();
    const mainGroup = resolveMainGroup(groupName, ledger.nature);

    let running = safeNum(ledger.openingBalance);
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
      const closing = opening + debit - credit;
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
    totalsByMainGroup,
    missingMappedLedgerNames,
  };
}
