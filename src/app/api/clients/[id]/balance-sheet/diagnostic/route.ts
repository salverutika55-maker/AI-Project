import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const client = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true }
    });

    const bsMappings = client.pnlMappings.filter(m => m.statementType === "BS");

    const diagnosticReport = [];
    ledgers.forEach(ledger => {
      const manualMapping = bsMappings.find(m => m.softwareLedgerName === ledger.name);
      let effectiveGroup = manualMapping ? manualMapping.groupName : ledger.groupName;
      effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();

      if (["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"].includes(effectiveGroup)) {
          return;
      }
      if (!effectiveGroup || effectiveGroup.toLowerCase() === "unknown" || effectiveGroup.toLowerCase() === "uncategorized") {
          return;
      }

      // Determine the structural nature of this ledger based on its mapped group
      let mainGroup = "Assets";
      if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(effectiveGroup)) {
          mainGroup = "Liabilities";
      } else if (ledger.name.toLowerCase().includes("profit & loss") || ledger.name.toLowerCase().includes("p&l")) {
          mainGroup = "Liabilities";
      }

      // Calculate App Balance based on strict CA rules
      let appBalance = ledger.closingBalance;
      if (mainGroup === "Assets") {
          appBalance = ledger.nature === "DEBIT" ? Math.abs(appBalance) : -Math.abs(appBalance);
      } else if (mainGroup === "Liabilities" || mainGroup === "Equity" || mainGroup === "Owner's Funds") {
          appBalance = ledger.nature === "CREDIT" ? Math.abs(appBalance) : -Math.abs(appBalance);
      }

      diagnosticReport.push({
        ledgerName: ledger.name,
        group: effectiveGroup,
        mainGroup: mainGroup,
        nature: ledger.nature,
        erpClosingBalance: ledger.closingBalance,
        appCalculatedBalance: appBalance,
        difference: ledger.closingBalance - Math.abs(appBalance) // Should be 0 if correctly applied
      });
    });

    // Also calculate the Profit & Loss Account auto-generation
    let pnlClosing = 0;
    ledgers.forEach(ledger => {
      const manualMapping = bsMappings.find(m => m.softwareLedgerName === ledger.name);
      let effectiveGroup = manualMapping ? manualMapping.groupName : ledger.groupName;
      effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();

      const isIncome = ["Sales Accounts", "Direct Incomes", "Indirect Incomes"].includes(effectiveGroup);
      const isExpense = ["Purchase Accounts", "Direct Expenses", "Indirect Expenses"].includes(effectiveGroup);

      if (isIncome) {
          pnlClosing += (ledger.nature === "CREDIT" ? ledger.closingBalance : -ledger.closingBalance);
      } else if (isExpense) {
          pnlClosing -= (ledger.nature === "DEBIT" ? ledger.closingBalance : -ledger.closingBalance);
      }
    });

    const totalAssets = diagnosticReport.filter(r => r.mainGroup === "Assets").reduce((sum, r) => sum + r.appCalculatedBalance, 0);
    const totalLiabilities = diagnosticReport.filter(r => r.mainGroup === "Liabilities").reduce((sum, r) => sum + r.appCalculatedBalance, 0) + pnlClosing;

    return NextResponse.json({
      success: true,
      diagnosticReport,
      reconciliation: {
        totalAssets,
        totalLiabilitiesAndEquity: totalLiabilities,
        pnlClosing,
        difference: totalAssets - totalLiabilities,
        isBalanced: Math.abs(totalAssets - totalLiabilities) < 1 // Account for tiny floating point
      }
    });

  } catch (error: any) {
    console.error("Diagnostic Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
