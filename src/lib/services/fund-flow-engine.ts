import { prisma } from "@/lib/prisma";
import { Sector } from "@prisma/client";

export const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
export const FULL_MONTHS = ["Opening", ...FY_MONTHS];
export const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface FundFlowLineItem {
  id: string;
  category: string;
  displayName: string;
  classification: "SOURCE" | "APPLICATION" | "WORKING_CAPITAL" | "RECONCILIATION";
  subCategory: "OPERATING" | "WORKING_CAPITAL" | "LONG_TERM" | "EQUITY" | "SUMMARY";
  isHeader?: boolean;
  isTotal?: boolean;
  values: Record<string, number>; // "Opening", "Apr" ... "Mar", "Closing", "Cumulative"
  ledgerIds?: string[];
  ledgerNames?: string[];
  explanation?: string;
}

export interface FundFlowReconciliation {
  month: string;
  openingWorkingCapital: number;
  sourcesTotal: number;
  applicationsTotal: number;
  netFundFlow: number;
  closingWorkingCapital: number;
  expectedClosingWorkingCapital: number;
  difference: number;
  isBalanced: boolean;
  possibleCauses: string[];
}

export interface FundFlowKPI {
  id: string;
  label: string;
  value: number | string;
  displayValue: string;
  trend?: "UP" | "DOWN" | "STABLE";
  changePct?: number;
  description: string;
  category: "LIQUIDITY" | "CYCLE" | "FUNDING" | "FLOW";
}

export interface ChartSeriesData {
  name: string; // month
  [key: string]: number | string;
}

export interface FundFlowChartConfig {
  id: string;
  title: string;
  type: "line" | "bar" | "area";
  description: string;
  dataKeys: { key: string; label: string; color: string }[];
  data: ChartSeriesData[];
}

export interface ManagementInsight {
  id: string;
  type: "POSITIVE" | "WARNING" | "INFO";
  title: string;
  description: string;
  impactAmount?: number;
  month?: string;
  category?: string;
}

export interface FundFlowResponse {
  clientId: string;
  clientName: string;
  sector: Sector;
  financialYear: number;
  months: string[];
  visibleMonths: string[];
  workingCapitalStatement: {
    currentAssets: FundFlowLineItem[];
    currentLiabilities: FundFlowLineItem[];
    workingCapitalSummary: FundFlowLineItem[];
  };
  sourcesOfFunds: FundFlowLineItem[];
  applicationsOfFunds: FundFlowLineItem[];
  summaryStatement: FundFlowLineItem[];
  reconciliation: Record<string, FundFlowReconciliation>;
  kpis: FundFlowKPI[];
  charts: FundFlowChartConfig[];
  insights: ManagementInsight[];
}

function safeNum(val: unknown): number {
  const n = Number(val || 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanStr(val: string | null | undefined): string {
  return (val || "").replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeKey(val: string | null | undefined): string {
  return cleanStr(val).toLowerCase();
}

// Categorization helper for Fund Flow
export function categorizeLedgerForFundFlow(
  ledgerName: string,
  groupName: string,
  nature: string,
  sector: Sector,
  mappingStatementType?: string,
  mappingGroup?: string,
  mappingSubHead?: string
): {
  mainBucket: "CURRENT_ASSET" | "CURRENT_LIABILITY" | "FIXED_ASSET" | "NON_CURRENT_LIABILITY" | "OWNERS_FUNDS" | "OPERATING_INCOME" | "OPERATING_EXPENSE" | "DEPRECIATION" | "OTHER";
  categoryKey: string;
  categoryLabel: string;
} {
  const name = normalizeKey(ledgerName);
  const gp = normalizeKey(groupName);
  const mGroup = normalizeKey(mappingGroup);
  const mSub = normalizeKey(mappingSubHead);

  // 1. Check if mapping specifies PNL or BS
  if (mappingStatementType === "PNL") {
    if (name.includes("depreciation") || gp.includes("depreciation") || mSub.includes("depreciation")) {
      return { mainBucket: "DEPRECIATION", categoryKey: "depreciation", categoryLabel: "Depreciation & Amortization" };
    }
    if (gp.includes("income") || gp.includes("sales") || gp.includes("revenue") || mGroup.includes("revenue") || mGroup.includes("sales")) {
      return { mainBucket: "OPERATING_INCOME", categoryKey: "operating_revenue", categoryLabel: "Operating Revenue" };
    }
    return { mainBucket: "OPERATING_EXPENSE", categoryKey: "operating_expense", categoryLabel: "Operating Expenses" };
  }

  // 2. SECTOR-SPECIFIC INVENTORY CLASSIFICATION
  if (sector === "MANUFACTURING") {
    if (name.includes("raw material") || gp.includes("raw material") || mSub.includes("raw material") || name.includes("r.m.") || name.includes("rm stock")) {
      return { mainBucket: "CURRENT_ASSET", categoryKey: "raw_material", categoryLabel: "Raw Material Inventory" };
    }
    if (name.includes("work in progress") || name.includes("wip") || gp.includes("work in progress") || gp.includes("wip") || mSub.includes("wip") || mSub.includes("work in progress")) {
      return { mainBucket: "CURRENT_ASSET", categoryKey: "wip_inventory", categoryLabel: "Work In Progress (WIP)" };
    }
    if (name.includes("finished goods") || name.includes("f.g.") || gp.includes("finished goods") || mSub.includes("finished goods") || name.includes("fg stock")) {
      return { mainBucket: "CURRENT_ASSET", categoryKey: "finished_goods", categoryLabel: "Finished Goods Inventory" };
    }
  }

  // General Inventory / Stock
  if (name.includes("stock") || name.includes("inventory") || gp.includes("stock") || gp.includes("inventory") || mSub.includes("stock") || mSub.includes("inventory") || gp.includes("closing stock")) {
    return { mainBucket: "CURRENT_ASSET", categoryKey: "inventory", categoryLabel: "Inventory / Stock-in-Hand" };
  }

  // Receivables / Debtors
  if (name.includes("debtor") || name.includes("receivable") || gp.includes("debtor") || gp.includes("receivable") || mSub.includes("debtor") || mSub.includes("receivable") || gp.includes("sundry debtors")) {
    return { mainBucket: "CURRENT_ASSET", categoryKey: "trade_receivables", categoryLabel: "Trade Receivables" };
  }

  // Service Sector Specific: Accrued Income / Unbilled Revenue
  if (sector === "SERVICE" && (name.includes("accrued") || name.includes("unbilled") || mSub.includes("accrued") || mSub.includes("unbilled"))) {
    return { mainBucket: "CURRENT_ASSET", categoryKey: "accrued_income", categoryLabel: "Accrued / Unbilled Income" };
  }

  // Cash & Bank
  if (name.includes("cash") || name.includes("bank") || gp.includes("cash") || gp.includes("bank") || mGroup.includes("bank") || mGroup.includes("cash")) {
    return { mainBucket: "CURRENT_ASSET", categoryKey: "cash_and_bank", categoryLabel: "Cash & Bank Balances" };
  }

  // Other Current Assets (Loans, Advances, Deposits, GST/Tax Assets)
  if (
    gp.includes("current asset") || gp.includes("loan & advance") || gp.includes("loans and advances") || gp.includes("deposits (assets)") ||
    mGroup.includes("current asset") || mSub.includes("advance") || mSub.includes("deposit") || name.includes("prepaid") || name.includes("advance to") || name.includes("input tax") || name.includes("gst input")
  ) {
    return { mainBucket: "CURRENT_ASSET", categoryKey: "other_current_assets", categoryLabel: "Other Current Assets & Advances" };
  }

  // Payables / Creditors
  if (name.includes("creditor") || name.includes("payable") || gp.includes("creditor") || gp.includes("payable") || mSub.includes("creditor") || mSub.includes("payable") || gp.includes("sundry creditors")) {
    return { mainBucket: "CURRENT_LIABILITY", categoryKey: "trade_payables", categoryLabel: "Trade Payables / Suppliers" };
  }

  // Service Sector Specific: Customer Advances / Unearned Revenue
  if (name.includes("customer advance") || name.includes("advance from customer") || name.includes("unearned") || mSub.includes("customer advance") || mSub.includes("unearned")) {
    return { mainBucket: "CURRENT_LIABILITY", categoryKey: "customer_advances", categoryLabel: "Customer Advances & Unearned Revenue" };
  }

  // Service Sector Specific: Employee liabilities
  if (sector === "SERVICE" && (name.includes("salary payable") || name.includes("wages payable") || name.includes("staff payable") || name.includes("employee") || mSub.includes("salary payable"))) {
    return { mainBucket: "CURRENT_LIABILITY", categoryKey: "employee_payables", categoryLabel: "Employee & Professional Payables" };
  }

  // Statutory Duties & Taxes
  if (gp.includes("duties & taxes") || gp.includes("duties and taxes") || name.includes("gst payable") || name.includes("tds payable") || name.includes("output gst") || mSub.includes("tax")) {
    return { mainBucket: "CURRENT_LIABILITY", categoryKey: "duties_and_taxes", categoryLabel: "Statutory & Tax Liabilities" };
  }

  // Provisions / Other Current Liabilities
  if (gp.includes("current liabilit") || gp.includes("provision") || mGroup.includes("current liabilit") || mSub.includes("provision") || name.includes("provision")) {
    return { mainBucket: "CURRENT_LIABILITY", categoryKey: "other_current_liabilities", categoryLabel: "Other Current Liabilities & Provisions" };
  }

  // Fixed Assets (CapEx)
  if (sector === "MANUFACTURING" && (name.includes("plant") || name.includes("machinery") || name.includes("equipment") || name.includes("factory") || mSub.includes("machinery") || mSub.includes("plant"))) {
    return { mainBucket: "FIXED_ASSET", categoryKey: "plant_and_machinery", categoryLabel: "Plant, Machinery & Factory Equipment" };
  }
  if (name.includes("capital work in progress") || name.includes("cwip") || mSub.includes("cwip")) {
    return { mainBucket: "FIXED_ASSET", categoryKey: "capital_wip", categoryLabel: "Capital Work in Progress (CWIP)" };
  }
  if (gp.includes("fixed asset") || mGroup.includes("fixed asset") || gp.includes("non-current asset") || mGroup.includes("non-current asset") || name.includes("building") || name.includes("computer") || name.includes("furniture") || name.includes("vehicle")) {
    return { mainBucket: "FIXED_ASSET", categoryKey: "fixed_assets", categoryLabel: "Fixed Assets & CapEx" };
  }

  // Non-Current Liabilities (Loans / Borrowings)
  if (gp.includes("loan") || gp.includes("borrowing") || gp.includes("secured") || gp.includes("unsecured") || mGroup.includes("loan") || mGroup.includes("borrowing")) {
    return { mainBucket: "NON_CURRENT_LIABILITY", categoryKey: "borrowings", categoryLabel: "Long-Term Loans & Borrowings" };
  }

  // Owner's Funds / Equity
  if (gp.includes("capital") || gp.includes("owner") || gp.includes("reserve") || gp.includes("surplus") || gp.includes("equity") || mGroup.includes("capital") || mGroup.includes("owner") || mGroup.includes("equity") || name.includes("share capital")) {
    return { mainBucket: "OWNERS_FUNDS", categoryKey: "owners_funds", categoryLabel: "Share Capital & Reserves" };
  }

  // Fallback by nature
  if (nature === "DEBIT") {
    return { mainBucket: "CURRENT_ASSET", categoryKey: "other_current_assets", categoryLabel: "Other Current Assets" };
  } else {
    return { mainBucket: "CURRENT_LIABILITY", categoryKey: "other_current_liabilities", categoryLabel: "Other Current Liabilities" };
  }
}

export async function calculateFundFlow(clientId: string, year: number): Promise<FundFlowResponse> {
  // 1. Fetch Client, Ledgers, Mappings, and Voucher Lines scoped strictly by clientId
  const [client, ledgers, mappings, voucherLines] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, sector: true, fiscalYearStartMonth: true }
    }),
    prisma.normalizedLedger.findMany({
      where: { clientId, isActive: true }
    }),
    prisma.unifiedLedgerMapping.findMany({
      where: { clientId }
    }),
    prisma.normalizedVoucherLine.findMany({
      where: { voucher: { clientId } },
      select: {
        ledgerId: true,
        amount: true,
        entryType: true,
        voucher: { select: { date: true, type: true } }
      }
    })
  ]);

  if (!client) {
    throw new Error("Client not found or access denied");
  }

  const sector = client.sector || Sector.TRADING;
  const targetFYStart = new Date(`${year}-04-01T00:00:00.000Z`);
  const targetFYEnd = new Date(`${year + 1}-03-31T23:59:59.999Z`);

  // Build mapping lookup
  const mappingMap = new Map<string, (typeof mappings)[number]>();
  for (const m of mappings) {
    mappingMap.set(normalizeKey(m.softwareLedgerName), m);
  }

  // Pre-calculate movements by voucher date
  const monthlyMovements: Record<string, Record<string, { debit: number; credit: number }>> = {};
  const preFYMovements: Record<string, { debit: number; credit: number }> = {};
  const fyVouchersTotal: Record<string, { revenue: number; cogs: number; expenses: number; depreciation: number }> = {};

  for (const m of FY_MONTHS) {
    fyVouchersTotal[m] = { revenue: 0, cogs: 0, expenses: 0, depreciation: 0 };
  }

  for (const vl of voucherLines) {
    const d = new Date(vl.voucher.date);
    const amt = safeNum(vl.amount);

    if (d < targetFYStart) {
      if (!preFYMovements[vl.ledgerId]) preFYMovements[vl.ledgerId] = { debit: 0, credit: 0 };
      if (vl.entryType === "DEBIT") preFYMovements[vl.ledgerId].debit += amt;
      else preFYMovements[vl.ledgerId].credit += amt;
      continue;
    }

    if (d > targetFYEnd) continue;

    const mName = MONTH_SHORT_NAMES[d.getUTCMonth()];
    if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
    if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };

    if (vl.entryType === "DEBIT") {
      monthlyMovements[vl.ledgerId][mName].debit += amt;
    } else {
      monthlyMovements[vl.ledgerId][mName].credit += amt;
    }
  }

  // Find earliest year in voucher dataset to handle derived opening forward
  let earliestYear = year;
  const voucherYears = voucherLines.map(vl => {
    const d = new Date(vl.voucher.date);
    return d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  });
  if (voucherYears.length > 0) earliestYear = Math.min(...voucherYears);

  // Group movement by ledger across years
  const movementsByLedgerYear = new Map<string, Map<number, { debit: number; credit: number }>>();
  for (const vl of voucherLines) {
    const d = new Date(vl.voucher.date);
    const vYear = d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
    if (!movementsByLedgerYear.has(vl.ledgerId)) movementsByLedgerYear.set(vl.ledgerId, new Map());
    const yearMap = movementsByLedgerYear.get(vl.ledgerId)!;
    if (!yearMap.has(vYear)) yearMap.set(vYear, { debit: 0, credit: 0 });
    const mov = yearMap.get(vYear)!;
    if (vl.entryType === "DEBIT") mov.debit += safeNum(vl.amount);
    else mov.credit += safeNum(vl.amount);
  }

  // Calculate monthly balances per ledger
  interface LedgerMonthlyBalance {
    ledgerId: string;
    ledgerName: string;
    groupName: string;
    nature: string;
    mainBucket: ReturnType<typeof categorizeLedgerForFundFlow>["mainBucket"];
    categoryKey: string;
    categoryLabel: string;
    monthlyBalances: Record<string, { opening: number; debit: number; credit: number; closing: number }>;
  }

  const ledgerBalances: LedgerMonthlyBalance[] = [];

  for (const ledger of ledgers) {
    if (ledger.name.toLowerCase().includes("difference in opening balance")) continue;

    const mapping = mappingMap.get(normalizeKey(ledger.name));
    const cat = categorizeLedgerForFundFlow(
      ledger.name,
      ledger.groupName,
      ledger.nature,
      sector,
      mapping?.statementType,
      mapping?.groupName,
      mapping?.subHeadName
    );

    const isAssetSide = ["CURRENT_ASSET", "FIXED_ASSET", "OPERATING_EXPENSE", "DEPRECIATION"].includes(cat.mainBucket);
    const rawOpening = safeNum(ledger.openingBalance);
    let runningOpening = Math.abs(rawOpening);
    if (isAssetSide && ledger.nature === "CREDIT") runningOpening = -runningOpening;
    if (!isAssetSide && ledger.nature === "DEBIT") runningOpening = -runningOpening;

    // Roll forward if year > earliestYear
    if (year > earliestYear) {
      for (let y = earliestYear; y < year; y++) {
        const mov = movementsByLedgerYear.get(ledger.id)?.get(y) || { debit: 0, credit: 0 };
        if (isAssetSide) {
          runningOpening = runningOpening + mov.debit - mov.credit;
        } else {
          runningOpening = runningOpening + mov.credit - mov.debit;
        }
      }
    }

    const monthlyBalances: Record<string, { opening: number; debit: number; credit: number; closing: number }> = {
      Opening: { opening: runningOpening, debit: 0, credit: 0, closing: runningOpening }
    };

    let curRunning = runningOpening;
    for (const m of FY_MONTHS) {
      const mv = monthlyMovements[ledger.id]?.[m] || { debit: 0, credit: 0 };
      const opening = curRunning;
      const debit = safeNum(mv.debit);
      const credit = safeNum(mv.credit);
      const closing = isAssetSide ? opening + debit - credit : opening + credit - debit;

      monthlyBalances[m] = { opening, debit, credit, closing };
      curRunning = closing;

      // Track P&L aggregate for Operating Funds calculation
      if (cat.mainBucket === "OPERATING_INCOME") {
        fyVouchersTotal[m].revenue += (credit - debit);
      } else if (cat.mainBucket === "DEPRECIATION") {
        fyVouchersTotal[m].depreciation += (debit - credit);
      } else if (cat.mainBucket === "OPERATING_EXPENSE") {
        fyVouchersTotal[m].expenses += (debit - credit);
      }
    }

    ledgerBalances.push({
      ledgerId: ledger.id,
      ledgerName: ledger.name,
      groupName: ledger.groupName,
      nature: ledger.nature,
      mainBucket: cat.mainBucket,
      categoryKey: cat.categoryKey,
      categoryLabel: cat.categoryLabel,
      monthlyBalances
    });
  }

  // 2. AGGREGATE WORKING CAPITAL COMPONENTS (Current Assets & Current Liabilities)
  const currentAssetCategories = new Map<string, { label: string; ledgerBalances: LedgerMonthlyBalance[] }>();
  const currentLiabilityCategories = new Map<string, { label: string; ledgerBalances: LedgerMonthlyBalance[] }>();
  const nonCurrentAssetCategories = new Map<string, { label: string; ledgerBalances: LedgerMonthlyBalance[] }>();
  const nonCurrentLiabilityCategories = new Map<string, { label: string; ledgerBalances: LedgerMonthlyBalance[] }>();
  const ownersFundsCategories = new Map<string, { label: string; ledgerBalances: LedgerMonthlyBalance[] }>();

  for (const lb of ledgerBalances) {
    if (lb.mainBucket === "CURRENT_ASSET") {
      if (!currentAssetCategories.has(lb.categoryKey)) {
        currentAssetCategories.set(lb.categoryKey, { label: lb.categoryLabel, ledgerBalances: [] });
      }
      currentAssetCategories.get(lb.categoryKey)!.ledgerBalances.push(lb);
    } else if (lb.mainBucket === "CURRENT_LIABILITY") {
      if (!currentLiabilityCategories.has(lb.categoryKey)) {
        currentLiabilityCategories.set(lb.categoryKey, { label: lb.categoryLabel, ledgerBalances: [] });
      }
      currentLiabilityCategories.get(lb.categoryKey)!.ledgerBalances.push(lb);
    } else if (lb.mainBucket === "FIXED_ASSET") {
      if (!nonCurrentAssetCategories.has(lb.categoryKey)) {
        nonCurrentAssetCategories.set(lb.categoryKey, { label: lb.categoryLabel, ledgerBalances: [] });
      }
      nonCurrentAssetCategories.get(lb.categoryKey)!.ledgerBalances.push(lb);
    } else if (lb.mainBucket === "NON_CURRENT_LIABILITY") {
      if (!nonCurrentLiabilityCategories.has(lb.categoryKey)) {
        nonCurrentLiabilityCategories.set(lb.categoryKey, { label: lb.categoryLabel, ledgerBalances: [] });
      }
      nonCurrentLiabilityCategories.get(lb.categoryKey)!.ledgerBalances.push(lb);
    } else if (lb.mainBucket === "OWNERS_FUNDS") {
      if (!ownersFundsCategories.has(lb.categoryKey)) {
        ownersFundsCategories.set(lb.categoryKey, { label: lb.categoryLabel, ledgerBalances: [] });
      }
      ownersFundsCategories.get(lb.categoryKey)!.ledgerBalances.push(lb);
    }
  }

  // Helper to sum monthly values for category
  function sumCategoryMonthly(catList: LedgerMonthlyBalance[]): Record<string, { opening: number; closing: number; movement: number }> {
    const res: Record<string, { opening: number; closing: number; movement: number }> = {};
    for (const m of FULL_MONTHS) {
      let openSum = 0;
      let closeSum = 0;
      for (const lb of catList) {
        openSum += lb.monthlyBalances[m]?.opening || 0;
        closeSum += lb.monthlyBalances[m]?.closing || 0;
      }
      res[m] = { opening: openSum, closing: closeSum, movement: closeSum - openSum };
    }
    return res;
  }

  // 3. BUILD WORKING CAPITAL STATEMENT
  const caLineItems: FundFlowLineItem[] = [];
  const caTotals: Record<string, number> = {};
  FULL_MONTHS.forEach(m => caTotals[m] = 0);

  currentAssetCategories.forEach((val, key) => {
    const monthly = sumCategoryMonthly(val.ledgerBalances);
    const itemValues: Record<string, number> = {};
    FULL_MONTHS.forEach(m => {
      itemValues[m] = monthly[m].closing;
      caTotals[m] += monthly[m].closing;
    });
    itemValues["Closing"] = itemValues["Mar"] ?? itemValues["Opening"];

    caLineItems.push({
      id: `ca_${key}`,
      category: key,
      displayName: val.label,
      classification: "WORKING_CAPITAL",
      subCategory: "WORKING_CAPITAL",
      values: itemValues,
      ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
      ledgerNames: val.ledgerBalances.map(l => l.ledgerName)
    });
  });

  const clLineItems: FundFlowLineItem[] = [];
  const clTotals: Record<string, number> = {};
  FULL_MONTHS.forEach(m => clTotals[m] = 0);

  currentLiabilityCategories.forEach((val, key) => {
    const monthly = sumCategoryMonthly(val.ledgerBalances);
    const itemValues: Record<string, number> = {};
    FULL_MONTHS.forEach(m => {
      itemValues[m] = monthly[m].closing;
      clTotals[m] += monthly[m].closing;
    });
    itemValues["Closing"] = itemValues["Mar"] ?? itemValues["Opening"];

    clLineItems.push({
      id: `cl_${key}`,
      category: key,
      displayName: val.label,
      classification: "WORKING_CAPITAL",
      subCategory: "WORKING_CAPITAL",
      values: itemValues,
      ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
      ledgerNames: val.ledgerBalances.map(l => l.ledgerName)
    });
  });

  // Working Capital Totals (CA - CL)
  const wcTotals: Record<string, number> = {};
  const deltaWCTotals: Record<string, number> = {};
  FULL_MONTHS.forEach(m => {
    wcTotals[m] = caTotals[m] - clTotals[m];
  });
  wcTotals["Closing"] = wcTotals["Mar"] ?? wcTotals["Opening"];

  let prevWC = wcTotals["Opening"];
  for (const m of FY_MONTHS) {
    deltaWCTotals[m] = wcTotals[m] - prevWC;
    prevWC = wcTotals[m];
  }
  deltaWCTotals["Opening"] = 0;
  deltaWCTotals["Closing"] = wcTotals["Closing"] - wcTotals["Opening"];

  const wcSummaryItems: FundFlowLineItem[] = [
    {
      id: "total_current_assets",
      category: "total_current_assets",
      displayName: "Total Current Assets (A)",
      classification: "WORKING_CAPITAL",
      subCategory: "SUMMARY",
      isTotal: true,
      values: { ...caTotals, Closing: caTotals["Mar"] ?? caTotals["Opening"] }
    },
    {
      id: "total_current_liabilities",
      category: "total_current_liabilities",
      displayName: "Total Current Liabilities (B)",
      classification: "WORKING_CAPITAL",
      subCategory: "SUMMARY",
      isTotal: true,
      values: { ...clTotals, Closing: clTotals["Mar"] ?? clTotals["Opening"] }
    },
    {
      id: "net_working_capital",
      category: "net_working_capital",
      displayName: "Net Working Capital (A - B)",
      classification: "WORKING_CAPITAL",
      subCategory: "SUMMARY",
      isTotal: true,
      values: wcTotals
    },
    {
      id: "change_in_working_capital",
      category: "change_in_working_capital",
      displayName: "Net Change in Working Capital",
      classification: "WORKING_CAPITAL",
      subCategory: "SUMMARY",
      isTotal: true,
      values: deltaWCTotals
    }
  ];

  // 4. COMPUTE SOURCES & APPLICATIONS OF FUNDS
  // A. Operating Funds from P&L (Funds from operations = Revenue - Expenses + Depreciation)
  const operatingFundsValues: Record<string, number> = { Opening: 0 };
  let cumOperatingFunds = 0;
  for (const m of FY_MONTHS) {
    const rev = fyVouchersTotal[m].revenue;
    const exp = fyVouchersTotal[m].expenses;
    const dep = fyVouchersTotal[m].depreciation;
    const opFunds = (rev - exp) + dep; // Add back non-cash depreciation
    operatingFundsValues[m] = opFunds;
    cumOperatingFunds += opFunds;
  }
  operatingFundsValues["Closing"] = cumOperatingFunds;

  const sourcesList: FundFlowLineItem[] = [];
  const applicationsList: FundFlowLineItem[] = [];

  // Add Funds from Operations to Sources (or Applications if negative)
  sourcesList.push({
    id: "src_operating_funds",
    category: "operating_funds",
    displayName: "Operating Funds / Funds From Operations",
    classification: "SOURCE",
    subCategory: "OPERATING",
    values: operatingFundsValues,
    explanation: "Operating cash flow generated from revenue after direct and indirect operating expenses with non-cash depreciation added back."
  });

  // B. Working Capital Movements:
  // Asset Decrease -> Source; Asset Increase -> Application
  currentAssetCategories.forEach((val, key) => {
    const monthly = sumCategoryMonthly(val.ledgerBalances);
    const srcVals: Record<string, number> = { Opening: 0 };
    const appVals: Record<string, number> = { Opening: 0 };
    let cumSrc = 0;
    let cumApp = 0;

    for (const m of FY_MONTHS) {
      const mov = monthly[m].movement; // closing - opening
      if (mov < 0) {
        // Decrease in asset -> Source of funds (released funds)
        const amt = Math.abs(mov);
        srcVals[m] = amt;
        appVals[m] = 0;
        cumSrc += amt;
      } else if (mov > 0) {
        // Increase in asset -> Application of funds (absorbed funds)
        srcVals[m] = 0;
        appVals[m] = mov;
        cumApp += mov;
      } else {
        srcVals[m] = 0;
        appVals[m] = 0;
      }
    }
    srcVals["Closing"] = cumSrc;
    appVals["Closing"] = cumApp;

    // Only add if there is active movement
    if (cumSrc > 0 || FY_MONTHS.some(m => srcVals[m] > 0)) {
      sourcesList.push({
        id: `src_asset_${key}`,
        category: key,
        displayName: `Reduction in ${val.label}`,
        classification: "SOURCE",
        subCategory: "WORKING_CAPITAL",
        values: srcVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Funds released through collection or liquidation of ${val.label}.`
      });
    }

    if (cumApp > 0 || FY_MONTHS.some(m => appVals[m] > 0)) {
      applicationsList.push({
        id: `app_asset_${key}`,
        category: key,
        displayName: `Increase in ${val.label}`,
        classification: "APPLICATION",
        subCategory: "WORKING_CAPITAL",
        values: appVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Funds absorbed/tied up in ${val.label}.`
      });
    }
  });

  // Liability Movements:
  // Liability Increase -> Source; Liability Decrease -> Application
  currentLiabilityCategories.forEach((val, key) => {
    const monthly = sumCategoryMonthly(val.ledgerBalances);
    const srcVals: Record<string, number> = { Opening: 0 };
    const appVals: Record<string, number> = { Opening: 0 };
    let cumSrc = 0;
    let cumApp = 0;

    for (const m of FY_MONTHS) {
      const mov = monthly[m].movement; // closing - opening
      if (mov > 0) {
        // Increase in liability -> Source of funds (supplier/creditor credit)
        srcVals[m] = mov;
        appVals[m] = 0;
        cumSrc += mov;
      } else if (mov < 0) {
        // Decrease in liability -> Application of funds (repaid liabilities)
        const amt = Math.abs(mov);
        srcVals[m] = 0;
        appVals[m] = amt;
        cumApp += amt;
      } else {
        srcVals[m] = 0;
        appVals[m] = 0;
      }
    }
    srcVals["Closing"] = cumSrc;
    appVals["Closing"] = cumApp;

    if (cumSrc > 0 || FY_MONTHS.some(m => srcVals[m] > 0)) {
      sourcesList.push({
        id: `src_liab_${key}`,
        category: key,
        displayName: `Increase in ${val.label}`,
        classification: "SOURCE",
        subCategory: "WORKING_CAPITAL",
        values: srcVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Operating funding provided by ${val.label}.`
      });
    }

    if (cumApp > 0 || FY_MONTHS.some(m => appVals[m] > 0)) {
      applicationsList.push({
        id: `app_liab_${key}`,
        category: key,
        displayName: `Reduction in ${val.label}`,
        classification: "APPLICATION",
        subCategory: "WORKING_CAPITAL",
        values: appVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Funds deployed towards settlements/repayments of ${val.label}.`
      });
    }
  });

  // C. Non-Current Assets (Fixed Assets / Plant & Machinery / CapEx):
  // Increase -> Application (CapEx); Decrease -> Source (Sale of Fixed Assets)
  nonCurrentAssetCategories.forEach((val, key) => {
    const monthly = sumCategoryMonthly(val.ledgerBalances);
    const srcVals: Record<string, number> = { Opening: 0 };
    const appVals: Record<string, number> = { Opening: 0 };
    let cumSrc = 0;
    let cumApp = 0;

    for (const m of FY_MONTHS) {
      const mov = monthly[m].movement;
      if (mov > 0) {
        srcVals[m] = 0;
        appVals[m] = mov;
        cumApp += mov;
      } else if (mov < 0) {
        const amt = Math.abs(mov);
        srcVals[m] = amt;
        appVals[m] = 0;
        cumSrc += amt;
      } else {
        srcVals[m] = 0;
        appVals[m] = 0;
      }
    }
    srcVals["Closing"] = cumSrc;
    appVals["Closing"] = cumApp;

    if (cumApp > 0 || FY_MONTHS.some(m => appVals[m] > 0)) {
      applicationsList.push({
        id: `app_capex_${key}`,
        category: key,
        displayName: `Purchase of ${val.label} (CapEx)`,
        classification: "APPLICATION",
        subCategory: "LONG_TERM",
        values: appVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Capital expenditure incurred on additions to ${val.label}.`
      });
    }

    if (cumSrc > 0 || FY_MONTHS.some(m => srcVals[m] > 0)) {
      sourcesList.push({
        id: `src_asset_sale_${key}`,
        category: key,
        displayName: `Sale / Realization of ${val.label}`,
        classification: "SOURCE",
        subCategory: "LONG_TERM",
        values: srcVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Proceeds received from the disposal or realization of ${val.label}.`
      });
    }
  });

  // D. Non-Current Liabilities (Loans / Borrowings):
  // Increase -> Source (New Borrowings); Decrease -> Application (Loan Repayment)
  nonCurrentLiabilityCategories.forEach((val, key) => {
    const monthly = sumCategoryMonthly(val.ledgerBalances);
    const srcVals: Record<string, number> = { Opening: 0 };
    const appVals: Record<string, number> = { Opening: 0 };
    let cumSrc = 0;
    let cumApp = 0;

    for (const m of FY_MONTHS) {
      const mov = monthly[m].movement;
      if (mov > 0) {
        srcVals[m] = mov;
        appVals[m] = 0;
        cumSrc += mov;
      } else if (mov < 0) {
        const amt = Math.abs(mov);
        srcVals[m] = 0;
        appVals[m] = amt;
        cumApp += amt;
      } else {
        srcVals[m] = 0;
        appVals[m] = 0;
      }
    }
    srcVals["Closing"] = cumSrc;
    appVals["Closing"] = cumApp;

    if (cumSrc > 0 || FY_MONTHS.some(m => srcVals[m] > 0)) {
      sourcesList.push({
        id: `src_borrowing_${key}`,
        category: key,
        displayName: `New Loans / Increase in ${val.label}`,
        classification: "SOURCE",
        subCategory: "LONG_TERM",
        values: srcVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Inflow from new long-term borrowings or credit facilities under ${val.label}.`
      });
    }

    if (cumApp > 0 || FY_MONTHS.some(m => appVals[m] > 0)) {
      applicationsList.push({
        id: `app_repay_${key}`,
        category: key,
        displayName: `Repayment of ${val.label}`,
        classification: "APPLICATION",
        subCategory: "LONG_TERM",
        values: appVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Principal repayment and reduction of ${val.label}.`
      });
    }
  });

  // E. Owner's Funds / Equity Movements
  ownersFundsCategories.forEach((val, key) => {
    const monthly = sumCategoryMonthly(val.ledgerBalances);
    const srcVals: Record<string, number> = { Opening: 0 };
    const appVals: Record<string, number> = { Opening: 0 };
    let cumSrc = 0;
    let cumApp = 0;

    for (const m of FY_MONTHS) {
      const mov = monthly[m].movement;
      if (mov > 0) {
        srcVals[m] = mov;
        appVals[m] = 0;
        cumSrc += mov;
      } else if (mov < 0) {
        const amt = Math.abs(mov);
        srcVals[m] = 0;
        appVals[m] = amt;
        cumApp += amt;
      } else {
        srcVals[m] = 0;
        appVals[m] = 0;
      }
    }
    srcVals["Closing"] = cumSrc;
    appVals["Closing"] = cumApp;

    if (cumSrc > 0 || FY_MONTHS.some(m => srcVals[m] > 0)) {
      sourcesList.push({
        id: `src_equity_${key}`,
        category: key,
        displayName: `Capital Injected / Increase in ${val.label}`,
        classification: "SOURCE",
        subCategory: "EQUITY",
        values: srcVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Capital infusion or equity addition from owners/shareholders.`
      });
    }

    if (cumApp > 0 || FY_MONTHS.some(m => appVals[m] > 0)) {
      applicationsList.push({
        id: `app_drawings_${key}`,
        category: key,
        displayName: `Drawings / Capital Withdrawn / Dividends`,
        classification: "APPLICATION",
        subCategory: "EQUITY",
        values: appVals,
        ledgerIds: val.ledgerBalances.map(l => l.ledgerId),
        ledgerNames: val.ledgerBalances.map(l => l.ledgerName),
        explanation: `Owner withdrawals, drawings, or dividend distributions.`
      });
    }
  });

  // Calculate Total Sources & Total Applications per month
  const totalSourcesValues: Record<string, number> = { Opening: 0 };
  const totalApplicationsValues: Record<string, number> = { Opening: 0 };
  const netFundFlowValues: Record<string, number> = { Opening: 0 };

  for (const m of FY_MONTHS) {
    let sSum = 0;
    for (const item of sourcesList) sSum += item.values[m] || 0;
    totalSourcesValues[m] = sSum;

    let aSum = 0;
    for (const item of applicationsList) aSum += item.values[m] || 0;
    totalApplicationsValues[m] = aSum;

    netFundFlowValues[m] = sSum - aSum;
  }

  let cumTotSources = 0;
  let cumTotApps = 0;
  for (const m of FY_MONTHS) {
    cumTotSources += totalSourcesValues[m];
    cumTotApps += totalApplicationsValues[m];
  }
  totalSourcesValues["Closing"] = cumTotSources;
  totalApplicationsValues["Closing"] = cumTotApps;
  netFundFlowValues["Closing"] = cumTotSources - cumTotApps;

  const summaryStatement: FundFlowLineItem[] = [
    {
      id: "total_sources_of_funds",
      category: "total_sources",
      displayName: "Total Sources of Funds (A)",
      classification: "SOURCE",
      subCategory: "SUMMARY",
      isTotal: true,
      values: totalSourcesValues
    },
    {
      id: "total_applications_of_funds",
      category: "total_applications",
      displayName: "Total Applications of Funds (B)",
      classification: "APPLICATION",
      subCategory: "SUMMARY",
      isTotal: true,
      values: totalApplicationsValues
    },
    {
      id: "net_fund_flow",
      category: "net_fund_flow",
      displayName: "Net Fund Flow (A - B)",
      classification: "WORKING_CAPITAL",
      subCategory: "SUMMARY",
      isTotal: true,
      values: netFundFlowValues
    }
  ];

  // 5. RECONCILIATION ENGINE
  // Validate Opening WC + Net Fund Flow = Closing WC per month & cumulative
  const reconciliationMap: Record<string, FundFlowReconciliation> = {};

  let rollingOpeningWC = wcTotals["Opening"];
  for (const m of FY_MONTHS) {
    const netFlow = netFundFlowValues[m];
    const actualClosingWC = wcTotals[m];
    const expectedClosingWC = rollingOpeningWC + netFlow;
    const diff = Math.round((actualClosingWC - expectedClosingWC) * 100) / 100;
    const isBalanced = Math.abs(diff) < 1.0;

    const causes: string[] = [];
    if (!isBalanced) {
      causes.push(`Unmapped or non-operational transaction variance of ${diff.toLocaleString("en-IN")}`);
      causes.push(`Check if non-cash accruals or direct equity entries bypassed the operating funds stream.`);
    }

    reconciliationMap[m] = {
      month: m,
      openingWorkingCapital: rollingOpeningWC,
      sourcesTotal: totalSourcesValues[m],
      applicationsTotal: totalApplicationsValues[m],
      netFundFlow: netFlow,
      closingWorkingCapital: actualClosingWC,
      expectedClosingWorkingCapital: expectedClosingWC,
      difference: diff,
      isBalanced,
      possibleCauses: causes
    };

    rollingOpeningWC = actualClosingWC;
  }

  // Cumulative Reconciliation
  const cumNetFlow = netFundFlowValues["Closing"];
  const cumActualClosingWC = wcTotals["Closing"];
  const cumExpectedClosingWC = wcTotals["Opening"] + cumNetFlow;
  const cumDiff = Math.round((cumActualClosingWC - cumExpectedClosingWC) * 100) / 100;

  reconciliationMap["Cumulative"] = {
    month: "Cumulative (Full FY)",
    openingWorkingCapital: wcTotals["Opening"],
    sourcesTotal: totalSourcesValues["Closing"],
    applicationsTotal: totalApplicationsValues["Closing"],
    netFundFlow: cumNetFlow,
    closingWorkingCapital: cumActualClosingWC,
    expectedClosingWorkingCapital: cumExpectedClosingWC,
    difference: cumDiff,
    isBalanced: Math.abs(cumDiff) < 1.0,
    possibleCauses: Math.abs(cumDiff) >= 1.0 ? ["Cumulative non-operating or direct capital adjustments"] : []
  };

  // 6. SECTOR-AWARE KPIS
  const kpis: FundFlowKPI[] = [];
  const latestMonth = FY_MONTHS[FY_MONTHS.length - 1]; // March or latest
  const totalRevYear = FY_MONTHS.reduce((acc, m) => acc + fyVouchersTotal[m].revenue, 0) || 1;
  const totalExpYear = FY_MONTHS.reduce((acc, m) => acc + fyVouchersTotal[m].expenses, 0) || 1;

  const currentRecVal = caLineItems.find(c => c.category === "trade_receivables")?.values["Closing"] || 0;
  const currentPayVal = clLineItems.find(c => c.category === "trade_payables")?.values["Closing"] || 0;
  const currentInvVal = caLineItems.find(c => ["inventory", "raw_material", "finished_goods"].includes(c.category))?.values["Closing"] || 0;

  // Days calculation
  const recDays = Math.round((currentRecVal / totalRevYear) * 365);
  const payDays = Math.round((currentPayVal / totalExpYear) * 365);
  const invDays = Math.round((currentInvVal / totalExpYear) * 365);
  const ccc = invDays + recDays - payDays;

  // Common KPIs
  kpis.push({
    id: "kpi_net_working_capital",
    label: "Net Working Capital",
    value: wcTotals["Closing"],
    displayValue: `₹${Math.round(wcTotals["Closing"]).toLocaleString("en-IN")}`,
    description: "Current Assets minus Current Liabilities as of period closing.",
    category: "LIQUIDITY"
  });

  kpis.push({
    id: "kpi_net_fund_flow",
    label: "Net Fund Flow (FY)",
    value: netFundFlowValues["Closing"],
    displayValue: `₹${Math.round(netFundFlowValues["Closing"]).toLocaleString("en-IN")}`,
    trend: netFundFlowValues["Closing"] >= 0 ? "UP" : "DOWN",
    description: "Total sources minus total applications generated across the financial year.",
    category: "FLOW"
  });

  if (sector === Sector.TRADING) {
    kpis.push({
      id: "kpi_rec_days",
      label: "Receivable Days (DSO)",
      value: recDays,
      displayValue: `${recDays} Days`,
      description: "Average collection period for trade customer debts.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_inv_days",
      label: "Inventory Holding Days",
      value: invDays,
      displayValue: `${invDays} Days`,
      description: "Average duration stock is held before sale.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_pay_days",
      label: "Payable Days (DPO)",
      value: payDays,
      displayValue: `${payDays} Days`,
      description: "Average credit duration extended by suppliers.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_ccc",
      label: "Cash Conversion Cycle (CCC)",
      value: ccc,
      displayValue: `${ccc} Days`,
      description: "Days taken to convert inventory and receivables into cash minus supplier credit.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_supplier_funding",
      label: "Supplier Funding",
      value: currentPayVal,
      displayValue: `₹${Math.round(currentPayVal).toLocaleString("en-IN")}`,
      description: "Working capital funded interest-free by trade payables.",
      category: "FUNDING"
    });
  } else if (sector === Sector.SERVICE) {
    const custAdvVal = clLineItems.find(c => c.category === "customer_advances")?.values["Closing"] || 0;
    const empLiabVal = clLineItems.find(c => c.category === "employee_payables")?.values["Closing"] || 0;

    kpis.push({
      id: "kpi_dso",
      label: "Debtor Collection Cycle (DSO)",
      value: recDays,
      displayValue: `${recDays} Days`,
      description: "Average turnaround time for billing and collecting professional fees.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_rev_rec_ratio",
      label: "Revenue vs Receivables",
      value: (totalRevYear / (currentRecVal || 1)).toFixed(2),
      displayValue: `${(totalRevYear / (currentRecVal || 1)).toFixed(1)}x`,
      description: "Velocity of annual revenue realization relative to outstanding receivables.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_cust_advance_funding",
      label: "Customer Advance Funding",
      value: custAdvVal,
      displayValue: `₹${Math.round(custAdvVal).toLocaleString("en-IN")}`,
      description: "Operating activities pre-funded by client retainers and advances.",
      category: "FUNDING"
    });
    kpis.push({
      id: "kpi_emp_funding",
      label: "Operating & Staff Payables",
      value: empLiabVal + currentPayVal,
      displayValue: `₹${Math.round(empLiabVal + currentPayVal).toLocaleString("en-IN")}`,
      description: "Short-term funding from accrued payroll and professional payables.",
      category: "FUNDING"
    });
  } else if (sector === Sector.MANUFACTURING) {
    const rmVal = caLineItems.find(c => c.category === "raw_material")?.values["Closing"] || 0;
    const wipVal = caLineItems.find(c => c.category === "wip_inventory")?.values["Closing"] || 0;
    const fgVal = caLineItems.find(c => c.category === "finished_goods")?.values["Closing"] || 0;
    const capexVal = applicationsList.filter(a => a.subCategory === "LONG_TERM").reduce((sum, a) => sum + (a.values["Closing"] || 0), 0);

    const rmDays = Math.round((rmVal / totalExpYear) * 365);
    const wipDays = Math.round((wipVal / totalExpYear) * 365);
    const fgDays = Math.round((fgVal / totalExpYear) * 365);
    const mfgCycle = rmDays + wipDays + fgDays + recDays - payDays;

    kpis.push({
      id: "kpi_rm_days",
      label: "Raw Material Days",
      value: rmDays,
      displayValue: `${rmDays} Days`,
      description: "Turnaround duration of raw material store holdings.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_wip_days",
      label: "WIP Production Cycle",
      value: wipDays,
      displayValue: `${wipDays} Days`,
      description: "Average dwell time in the factory production floor.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_fg_days",
      label: "Finished Goods Holding",
      value: fgDays,
      displayValue: `${fgDays} Days`,
      description: "Average days finished items remain in warehouse before dispatch.",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_mfg_cycle",
      label: "Manufacturing Operating Cycle",
      value: mfgCycle,
      displayValue: `${mfgCycle} Days`,
      description: "Complete manufacturing cash conversion cycle (RM + WIP + FG + DSO - DPO).",
      category: "CYCLE"
    });
    kpis.push({
      id: "kpi_capex_funding",
      label: "CapEx Additions (Plant & Machinery)",
      value: capexVal,
      displayValue: `₹${Math.round(capexVal).toLocaleString("en-IN")}`,
      description: "Total capital expenditure deployed into factory fixed assets.",
      category: "FUNDING"
    });
    kpis.push({
      id: "kpi_supplier_funding",
      label: "Supplier Credit Funding",
      value: currentPayVal,
      displayValue: `₹${Math.round(currentPayVal).toLocaleString("en-IN")}`,
      description: "Factory supply chain funded by trade creditors.",
      category: "FUNDING"
    });
  }

  // 7. CHART DATASETS
  const charts: FundFlowChartConfig[] = [
    {
      id: "net_fund_flow_trend",
      title: "Monthly Net Fund Flow Trend",
      type: "line",
      description: "Trend of net liquid funds generated vs absorbed per month.",
      dataKeys: [
        { key: "netFlow", label: "Net Fund Flow", color: "#22D3EE" },
        { key: "sources", label: "Total Sources", color: "#10B981" },
        { key: "applications", label: "Total Applications", color: "#F43F5E" }
      ],
      data: FY_MONTHS.map(m => ({
        name: m,
        netFlow: netFundFlowValues[m],
        sources: totalSourcesValues[m],
        applications: totalApplicationsValues[m]
      }))
    },
    {
      id: "working_capital_trend",
      title: "Working Capital Movement Trend",
      type: "area",
      description: "Comparative movement of Current Assets, Current Liabilities, and Net Working Capital.",
      dataKeys: [
        { key: "currentAssets", label: "Current Assets", color: "#10B981" },
        { key: "currentLiabilities", label: "Current Liabilities", color: "#F43F5E" },
        { key: "workingCapital", label: "Net Working Capital", color: "#3B82F6" }
      ],
      data: FULL_MONTHS.map(m => ({
        name: m,
        currentAssets: caTotals[m],
        currentLiabilities: clTotals[m],
        workingCapital: wcTotals[m]
      }))
    },
    {
      id: "sources_vs_applications_bar",
      title: "Monthly Sources vs Applications",
      type: "bar",
      description: "Side-by-side comparison of total funding sources against fund deployments.",
      dataKeys: [
        { key: "sources", label: "Sources", color: "#10B981" },
        { key: "applications", label: "Applications", color: "#F43F5E" }
      ],
      data: FY_MONTHS.map(m => ({
        name: m,
        sources: totalSourcesValues[m],
        applications: totalApplicationsValues[m]
      }))
    },
    {
      id: "cumulative_fund_flow",
      title: "Cumulative Fund Flow Evolution",
      type: "line",
      description: "Cumulative evolution of funds from opening working capital to full FY closing.",
      dataKeys: [
        { key: "cumNetFlow", label: "Cumulative Net Flow", color: "#A855F7" },
        { key: "workingCapital", label: "Closing Working Capital", color: "#22D3EE" }
      ],
      data: (() => {
        let rolling = 0;
        return FY_MONTHS.map(m => {
          rolling += netFundFlowValues[m];
          return {
            name: m,
            cumNetFlow: rolling,
            workingCapital: wcTotals[m]
          };
        });
      })()
    }
  ];

  // Sector-Specific Auxiliary Charts
  if (sector === Sector.TRADING) {
    charts.push({
      id: "trading_cycle_breakdown",
      title: "Inventory vs Receivables vs Payables",
      type: "line",
      description: "Evolution of operating working capital drivers in the trading cycle.",
      dataKeys: [
        { key: "receivables", label: "Trade Receivables", color: "#22D3EE" },
        { key: "inventory", label: "Inventory", color: "#F59E0B" },
        { key: "payables", label: "Trade Payables", color: "#EC4899" }
      ],
      data: FULL_MONTHS.map(m => ({
        name: m,
        receivables: caLineItems.find(c => c.category === "trade_receivables")?.values[m] || 0,
        inventory: caLineItems.find(c => c.category === "inventory")?.values[m] || 0,
        payables: clLineItems.find(c => c.category === "trade_payables")?.values[m] || 0
      }))
    });
  } else if (sector === Sector.SERVICE) {
    charts.push({
      id: "service_revenue_receivables",
      title: "Revenue vs Receivables vs Customer Advances",
      type: "bar",
      description: "Service billing realization and client pre-funding trends.",
      dataKeys: [
        { key: "revenue", label: "Monthly Revenue", color: "#10B981" },
        { key: "receivables", label: "Receivables", color: "#3B82F6" },
        { key: "advances", label: "Customer Advances", color: "#A855F7" }
      ],
      data: FY_MONTHS.map(m => ({
        name: m,
        revenue: fyVouchersTotal[m].revenue,
        receivables: caLineItems.find(c => c.category === "trade_receivables")?.values[m] || 0,
        advances: clLineItems.find(c => c.category === "customer_advances")?.values[m] || 0
      }))
    });
  } else if (sector === Sector.MANUFACTURING) {
    charts.push({
      id: "mfg_inventory_breakdown",
      title: "Raw Material vs WIP vs Finished Goods",
      type: "bar",
      description: "Inventory stages decomposition across the factory pipeline.",
      dataKeys: [
        { key: "rawMaterial", label: "Raw Material", color: "#F59E0B" },
        { key: "wip", label: "Work in Progress", color: "#A855F7" },
        { key: "finishedGoods", label: "Finished Goods", color: "#10B981" }
      ],
      data: FULL_MONTHS.map(m => ({
        name: m,
        rawMaterial: caLineItems.find(c => c.category === "raw_material")?.values[m] || 0,
        wip: caLineItems.find(c => c.category === "wip_inventory")?.values[m] || 0,
        finishedGoods: caLineItems.find(c => c.category === "finished_goods")?.values[m] || 0
      }))
    });
  }

  // 8. DATA-DRIVEN MANAGEMENT INSIGHTS
  const insights: ManagementInsight[] = [];

  // Working Capital Insight
  const wcDelta = wcTotals["Closing"] - wcTotals["Opening"];
  if (wcDelta > 0) {
    insights.push({
      id: "ins_wc_increase",
      type: "POSITIVE",
      title: "Working Capital Expansion",
      description: `Net Working Capital expanded by ₹${Math.round(wcDelta).toLocaleString("en-IN")} over the financial year, strengthening liquidity reserves.`,
      impactAmount: wcDelta
    });
  } else if (wcDelta < 0) {
    insights.push({
      id: "ins_wc_decrease",
      type: "WARNING",
      title: "Working Capital Contraction",
      description: `Net Working Capital contracted by ₹${Math.round(Math.abs(wcDelta)).toLocaleString("en-IN")}, indicating funds deployed into non-current assets or debt settlement.`,
      impactAmount: Math.abs(wcDelta)
    });
  }

  // Operating Funds Insight
  if (operatingFundsValues["Closing"] > 0) {
    insights.push({
      id: "ins_op_funds",
      type: "POSITIVE",
      title: "Positive Operating Funds Generation",
      description: `Core operations generated ₹${Math.round(operatingFundsValues["Closing"]).toLocaleString("en-IN")} of fresh funding across the year.`,
      impactAmount: operatingFundsValues["Closing"]
    });
  }

  // Top Receivables Absorption / Release
  const recLine = applicationsList.find(a => a.category === "trade_receivables") || sourcesList.find(s => s.category === "trade_receivables");
  if (recLine && recLine.values["Closing"] > 0) {
    if (recLine.classification === "APPLICATION") {
      insights.push({
        id: "ins_rec_absorption",
        type: "WARNING",
        title: "Liquidity Absorbed in Trade Receivables",
        description: `Customer dues increased by ₹${Math.round(recLine.values["Closing"]).toLocaleString("en-IN")}, absorbing operational funds during the year.`,
        impactAmount: recLine.values["Closing"]
      });
    } else {
      insights.push({
        id: "ins_rec_release",
        type: "POSITIVE",
        title: "Cash Released from Receivables Collection",
        description: `Collections from trade debtors released ₹${Math.round(recLine.values["Closing"]).toLocaleString("en-IN")} in liquid operating funds.`,
        impactAmount: recLine.values["Closing"]
      });
    }
  }

  // Supplier Funding Insight
  const payLine = sourcesList.find(s => s.category === "trade_payables");
  if (payLine && payLine.values["Closing"] > 0) {
    insights.push({
      id: "ins_pay_funding",
      type: "INFO",
      title: "Supplier Credit Operating Funding",
      description: `Trade payables provided ₹${Math.round(payLine.values["Closing"]).toLocaleString("en-IN")} of interest-free working capital funding.`,
      impactAmount: payLine.values["Closing"]
    });
  }

  // Fixed Asset CapEx Insight
  const capexItems = applicationsList.filter(a => a.subCategory === "LONG_TERM");
  const totalCapex = capexItems.reduce((acc, c) => acc + (c.values["Closing"] || 0), 0);
  if (totalCapex > 0) {
    insights.push({
      id: "ins_capex",
      type: "INFO",
      title: "Capital Expenditure Investment",
      description: `₹${Math.round(totalCapex).toLocaleString("en-IN")} was invested into fixed asset additions and production infrastructure.`,
      impactAmount: totalCapex
    });
  }

  return {
    clientId: client.id,
    clientName: client.name,
    sector,
    financialYear: year,
    months: FULL_MONTHS,
    visibleMonths: FY_MONTHS,
    workingCapitalStatement: {
      currentAssets: caLineItems,
      currentLiabilities: clLineItems,
      workingCapitalSummary: wcSummaryItems
    },
    sourcesOfFunds: sourcesList,
    applicationsOfFunds: applicationsList,
    summaryStatement,
    reconciliation: reconciliationMap,
    kpis,
    charts,
    insights
  };
}
