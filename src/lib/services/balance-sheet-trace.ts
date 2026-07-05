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
  openingSource: "ledger_opening" | "derived_from_closing" | "derived_from_pre_fy" | "derived_from_backward";
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
      where: { clientId },
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

    const mName = MONTH_SHORT_NAMES[d.getUTCMonth()];
    if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
    if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };

    if (vl.entryType === "DEBIT") {
      monthlyMovements[vl.ledgerId][mName].debit += safeNum(vl.amount);
    } else {
      monthlyMovements[vl.ledgerId][mName].credit += safeNum(vl.amount);
    }
  }

  const bsMappings = mappings.filter((m) => m.statementType === "BS");
  const pnlMappings = mappings.filter((m) => m.statementType === "PNL");

  const mappingByLedger = new Map<string, (typeof bsMappings)[number]>();
  for (const m of bsMappings) {
    mappingByLedger.set(mappingKey(m.softwareLedgerName), m);
  }

  const missingMappedLedgerNames = bsMappings
    .filter((m) => !ledgers.some((l) => mappingKey(l.name) === mappingKey(m.softwareLedgerName)))
    .map((m) => m.softwareLedgerName);

  // Determine latest synced year (maximum year of vouchers in database)
  let latestYear = year;
  const voucherYears = voucherLines.map((vl) => {
    const d = new Date(vl.voucher.date);
    return d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  });
  if (voucherYears.length > 0) {
    latestYear = Math.max(...voucherYears);
  }

  // Pre-calculate movements by ledger ID and financial year
  const movementsByLedgerYear = new Map<string, Map<number, { debit: number; credit: number }>>();
  for (const vl of voucherLines) {
    const d = new Date(vl.voucher.date);
    const vYear = d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
    
    if (!movementsByLedgerYear.has(vl.ledgerId)) {
      movementsByLedgerYear.set(vl.ledgerId, new Map());
    }
    const yearMap = movementsByLedgerYear.get(vl.ledgerId)!;
    if (!yearMap.has(vYear)) {
      yearMap.set(vYear, { debit: 0, credit: 0 });
    }
    const mov = yearMap.get(vYear)!;
    if (vl.entryType === "DEBIT") {
      mov.debit += safeNum(vl.amount);
    } else {
      mov.credit += safeNum(vl.amount);
    }
  }

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

    let running = normalizeOpeningForFormula(safeNum(ledger.openingBalance), ledger.nature, mainGroup);
    let openingSource: "ledger_opening" | "derived_from_closing" | "derived_from_pre_fy" | "derived_from_backward" = "ledger_opening";

    if (year < latestYear) {
      let currentClosing = running;
      for (let y = latestYear - 1; y >= year; y--) {
        const mov = movementsByLedgerYear.get(ledger.id)?.get(y) || { debit: 0, credit: 0 };
        if (mainGroup === "Assets") {
          currentClosing = currentClosing - mov.debit + mov.credit;
        } else {
          currentClosing = currentClosing - mov.credit + mov.debit;
        }
      }
      running = currentClosing;
      openingSource = "derived_from_backward";
    } else {
      if (preFY.debit !== 0 || preFY.credit !== 0) {
        if (mainGroup === "Assets") {
          running = running + preFY.debit - preFY.credit;
        } else {
          running = running + preFY.credit - preFY.debit;
        }
        openingSource = "derived_from_pre_fy";
      } else {
        let signedClosingBal = safeNum(ledger.closingBalance);
        // Derive opening balance only if we do not have transaction history and initial opening is 0
        if (running === 0 && signedClosingBal !== 0) {
          signedClosingBal = normalizeOpeningForFormula(signedClosingBal, ledger.nature, mainGroup);
          running = mainGroup === "Assets"
            ? signedClosingBal - fyMovement.debit + fyMovement.credit
            : signedClosingBal - fyMovement.credit + fyMovement.debit;
          openingSource = "derived_from_closing";
        }
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

  // 1. DYNAMIC PROFIT & LOSS ACCOUNT INJECTION
  const pnlLedgerNames = new Set(pnlMappings.map((m) => mappingKey(m.softwareLedgerName)));
  const pnlLedgers = ledgers.filter(
    (l) =>
      pnlLedgerNames.has(mappingKey(l.name)) ||
      l.name.toLowerCase().includes("profit & loss") ||
      l.name.toLowerCase().includes("p&l") ||
      l.groupName.toLowerCase().includes("expense") ||
      l.groupName.toLowerCase().includes("income") ||
      l.groupName.toLowerCase().includes("sales") ||
      l.groupName.toLowerCase().includes("purchase")
  );
  const pnlLedgerIds = new Set(pnlLedgers.map((l) => l.id));

  let pnlPreFY = 0;
  const pnlMonthlyNet: Record<string, number> = {
    Apr: 0, May: 0, Jun: 0, Jul: 0, Aug: 0, Sep: 0, Oct: 0, Nov: 0, Dec: 0, Jan: 0, Feb: 0, Mar: 0
  };

  for (const vl of voucherLines) {
    if (pnlLedgerIds.has(vl.ledgerId)) {
      const d = new Date(vl.voucher.date);
      const amt = vl.entryType === "CREDIT" ? safeNum(vl.amount) : -safeNum(vl.amount);
      if (d < targetFYStart) {
        pnlPreFY += amt;
      } else if (d <= targetFYEnd) {
        const mName = MONTH_SHORT_NAMES[d.getUTCMonth()];
        if (pnlMonthlyNet[mName] !== undefined) {
          pnlMonthlyNet[mName] += amt;
        }
      }
    }
  }

  const pnlMonthTraces: Record<string, LedgerMonthTrace> = {};
  let pnlRunning = pnlPreFY;
  pnlMonthTraces["Opening"] = { opening: pnlRunning, debit: 0, credit: 0, closing: pnlRunning };
  for (const month of FY_MONTHS) {
    const opening = pnlRunning;
    const net = pnlMonthlyNet[month];
    const credit = net >= 0 ? net : 0;
    const debit = net < 0 ? -net : 0;
    const closing = opening + credit - debit;
    pnlMonthTraces[month] = { opening, debit, credit, closing };
    pnlRunning = closing;
  }

  const pnlLedgerRecord = ledgers.find(
    (l) => l.name.toLowerCase().includes("profit & loss") || l.name.toLowerCase().includes("p&l")
  );

  ledgerTraces.push({
    ledgerId: pnlLedgerRecord?.id || "pnl-retained-earnings",
    ledgerName: "Profit & Loss A/c",
    groupName: "Owner's Funds",
    subGroupName: "Reserves & Surplus",
    subHeadName: "Reserves & Surplus",
    mainGroup: "Liabilities",
    nature: "CREDIT",
    dbOpeningBalance: 0,
    dbClosingBalance: pnlLedgerRecord ? safeNum(pnlLedgerRecord.closingBalance) : 0,
    openingSource: "derived_from_pre_fy",
    monthTraces: pnlMonthTraces,
  });

  // 2. DIFFERENCE IN OPENING BALANCES INJECTION
  let openingSum = 0;
  for (const l of ledgers) {
    const op = safeNum(l.openingBalance);
    if (op !== 0) {
      const isCredit = l.nature === "CREDIT";
      openingSum += isCredit ? -op : op;
    }
  }
  const diffOpeningVal = -openingSum;

  if (Math.abs(diffOpeningVal) > 0.01) {
    const mainGroup = diffOpeningVal < 0 ? "Liabilities" : "Assets";
    const groupName = diffOpeningVal < 0 ? "Owner's Funds" : "Current Assets";
    const subHeadName = "Difference in Opening Balances";
    const diffMonthTraces: Record<string, LedgerMonthTrace> = {};
    diffMonthTraces["Opening"] = {
      opening: Math.abs(diffOpeningVal),
      debit: 0,
      credit: 0,
      closing: Math.abs(diffOpeningVal),
    };
    for (const month of FY_MONTHS) {
      diffMonthTraces[month] = {
        opening: Math.abs(diffOpeningVal),
        debit: 0,
        credit: 0,
        closing: Math.abs(diffOpeningVal),
      };
    }

    ledgerTraces.push({
      ledgerId: "diff-opening-balances",
      ledgerName: "Difference in Opening Balances",
      groupName,
      subGroupName: subHeadName,
      subHeadName,
      mainGroup,
      nature: diffOpeningVal < 0 ? "CREDIT" : "DEBIT",
      dbOpeningBalance: Math.abs(diffOpeningVal),
      dbClosingBalance: Math.abs(diffOpeningVal),
      openingSource: "ledger_opening",
      monthTraces: diffMonthTraces,
    });
  }

  // 3. DYNAMIC DIFFERENCE IN BALANCES INJECTION
  const diffBalMonthTraces: Record<string, LedgerMonthTrace> = {};
  for (const period of FULL_MONTHS) {
    let assetsSum = 0;
    let liabilitiesSum = 0;
    for (const row of ledgerTraces) {
      const val = row.monthTraces[period]?.closing || 0;
      if (row.mainGroup === "Assets") {
        assetsSum += val;
      } else {
        liabilitiesSum += val;
      }
    }
    const diff = assetsSum - liabilitiesSum;
    diffBalMonthTraces[period] = {
      opening: diff,
      debit: 0,
      credit: 0,
      closing: diff
    };
  }

  ledgerTraces.push({
    ledgerId: "diff-balances",
    ledgerName: "Difference in Balances",
    groupName: "Owner's Funds",
    subGroupName: "Reserves & Surplus",
    subHeadName: "Reserves & Surplus",
    mainGroup: "Liabilities",
    nature: "CREDIT",
    dbOpeningBalance: 0,
    dbClosingBalance: 0,
    openingSource: "derived_from_pre_fy",
    monthTraces: diffBalMonthTraces,
  });



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
