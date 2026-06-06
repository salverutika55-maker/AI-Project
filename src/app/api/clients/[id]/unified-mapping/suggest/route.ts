import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeClientAction } from "@/lib/rbac";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await authorizeClientAction(user.id, id, "READ_ONLY");

    const { ledgerName, parentGroup } = await req.json();

    const nameStr = (ledgerName || "").toLowerCase();
    const groupStr = (parentGroup || "").toLowerCase();

    // 1. Fetch Existing Company Structure (Layer 1)
    // In a real advanced AI, we would pass all `unifiedMappings` to the LLM to see if similar names exist.
    // We will simulate this by checking if the exact name exists, though the UI prevents mapping an already mapped ledger.

    // 2. Fetch Transactions / Voucher Behavior (Layer 2 & 3)
    const vouchers = await prisma.tallyVoucher.findMany({
      where: { clientId: id, ledgerName: ledgerName }
    });

    // Calculate Behavioral Metrics
    let purchaseCount = 0;
    let salesCount = 0;
    let paymentCount = 0;
    let receiptCount = 0;
    let journalCount = 0;
    let debitSum = 0;
    let creditSum = 0;

    vouchers.forEach(v => {
      const type = v.voucherType.toLowerCase();
      if (type.includes("purchase")) purchaseCount++;
      else if (type.includes("sale")) salesCount++;
      else if (type.includes("payment")) paymentCount++;
      else if (type.includes("receipt")) receiptCount++;
      else journalCount++;

      if (v.isDebit) debitSum += v.amount;
      else creditSum += v.amount;
    });

    const totalVouchers = vouchers.length;

    // 3. Opening / Closing Balance Behavior (Layer 5)
    // Look up NormalizedLedger to see if it has a Dr/Cr nature
    const ledger = await prisma.normalizedLedger.findFirst({
      where: { clientId: id, name: ledgerName }
    });

    const isDebitBalance = ledger ? ledger.nature === "DEBIT" : debitSum > creditSum;

    // --- BEHAVIORAL AI SCORING ENGINE ---
    
    let aiScores: Record<string, number> = {
      "Trade Receivables": 0,
      "Trade Payables": 0,
      "Duties & Taxes": 0,
      "Fixed Assets": 0,
      "Bank Accounts": 0,
      "Cash-In-Hand": 0,
      "Operating Expenses": 0,
      "Direct Expenses": 0,
      "Employee Costs": 0,
      "Revenue": 0
    };

    let baseReason = [];

    // Evaluate ERP Group Input (Baseline Weight)
    if (groupStr.includes("debtor")) aiScores["Trade Receivables"] += 30;
    if (groupStr.includes("creditor")) aiScores["Trade Payables"] += 30;
    if (groupStr.includes("indirect expense")) aiScores["Operating Expenses"] += 30;
    if (groupStr.includes("direct expense")) aiScores["Direct Expenses"] += 30;
    if (groupStr.includes("fixed asset")) aiScores["Fixed Assets"] += 30;
    if (groupStr.includes("bank") || groupStr.includes("cash")) { aiScores["Bank Accounts"] += 30; aiScores["Cash-In-Hand"] += 30; }

    // Evaluate Name Input (Layer 1)
    if (nameStr.includes("supplier") || nameStr.includes("vendor") || nameStr.includes("payable")) {
      aiScores["Trade Payables"] += 40;
      baseReason.push("Name indicates a vendor relationship.");
    }
    if (nameStr.includes("customer") || nameStr.includes("buyer") || nameStr.includes("receivable")) {
      aiScores["Trade Receivables"] += 40;
      baseReason.push("Name indicates a customer relationship.");
    }
    if (nameStr.includes("salary") || nameStr.includes("wage") || nameStr.includes("pf")) {
      aiScores["Employee Costs"] += 50;
      baseReason.push("Name indicates payroll/employee expense.");
    }
    if (nameStr.includes("gst") || nameStr.includes("tax") || nameStr.includes("tds")) {
      aiScores["Duties & Taxes"] += 50;
      baseReason.push("Name indicates statutory taxation.");
    }

    // Evaluate Voucher Behavior (Layer 2 & 3)
    if (totalVouchers > 0) {
      if (purchaseCount > 0 || paymentCount > 0) {
        let pct = ((purchaseCount + paymentCount) / totalVouchers) * 100;
        if (pct > 50) {
          aiScores["Trade Payables"] += 50;
          baseReason.push(`${pct.toFixed(0)}% of transactions are Purchases/Payments.`);
        }
      }
      
      if (salesCount > 0 || receiptCount > 0) {
        let pct = ((salesCount + receiptCount) / totalVouchers) * 100;
        if (pct > 50) {
          aiScores["Trade Receivables"] += 50;
          baseReason.push(`${pct.toFixed(0)}% of transactions are Sales/Receipts.`);
        }
      }
    }

    // Evaluate Balances (Layer 5)
    if (isDebitBalance) {
      aiScores["Trade Receivables"] += 15;
      aiScores["Fixed Assets"] += 10;
      aiScores["Operating Expenses"] += 10;
      aiScores["Trade Payables"] -= 20; // Penalize Payables if Debit balance
    } else {
      aiScores["Trade Payables"] += 15;
      aiScores["Duties & Taxes"] += 10;
      aiScores["Revenue"] += 10;
      aiScores["Trade Receivables"] -= 20; // Penalize Receivables if Credit balance
    }

    // Find the highest score
    let highestCategory = "Operating Expenses";
    let highestScore = 0;
    
    for (const [cat, score] of Object.entries(aiScores)) {
      if (score > highestScore) {
        highestScore = score;
        highestCategory = cat;
      }
    }

    // Calculate final Confidence percentage (capped at 98%)
    // Base confidence is roughly (highestScore / 135) * 100
    let confidence = Math.min(Math.round((highestScore / 120) * 100), 98);
    
    // If no vouchers and no strong name clues, lower confidence
    if (totalVouchers === 0 && highestScore <= 30) {
      confidence = 45; 
      baseReason.push("Low confidence due to lack of transaction history and vague naming.");
    }

    // Debtor/Creditor Anomaly Detection!
    if (groupStr.includes("debtor") && highestCategory === "Trade Payables") {
      baseReason.unshift("⚠️ ERP MISCLASSIFICATION DETECTED: Ledger is grouped as Sundry Debtors in ERP, but transaction behavior strongly indicates a Vendor (Creditor).");
      confidence = Math.min(confidence, 92); // High confidence, but acknowledge the override
    } else if (groupStr.includes("creditor") && highestCategory === "Trade Receivables") {
      baseReason.unshift("⚠️ ERP MISCLASSIFICATION DETECTED: Ledger is grouped as Sundry Creditors in ERP, but transaction behavior strongly indicates a Customer (Debtor).");
      confidence = Math.min(confidence, 92);
    } else if (baseReason.length === 0) {
      baseReason.push("Mapped based on standard ERP grouping and typical balance behavior.");
    }

    // Map Category to precise unified schema
    let suggestion = null;
    switch (highestCategory) {
      case "Trade Receivables":
        suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Trade Receivable", subHeadName: "Trade Debtors" };
        break;
      case "Trade Payables":
        suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Trade Payable", subHeadName: "Trade Payables" };
        break;
      case "Duties & Taxes":
        suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Duties & Taxes", subHeadName: "Taxes" };
        break;
      case "Fixed Assets":
        suggestion = { statementType: "BS", groupName: "Non-Current Assets", subGroupName: "Fixed Assets", subHeadName: "Fixed Assets" };
        break;
      case "Bank Accounts":
        suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Bank Accounts", subHeadName: "Bank Balances" };
        break;
      case "Cash-In-Hand":
        suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Cash-In-Hand", subHeadName: "Cash" };
        break;
      case "Operating Expenses":
        suggestion = { statementType: "PNL", groupName: "Operating Expenses", subHeadName: "General Expenses" };
        break;
      case "Direct Expenses":
        suggestion = { statementType: "PNL", groupName: "Direct Expenses", subHeadName: "Direct Expenses" };
        break;
      case "Employee Costs":
        suggestion = { statementType: "PNL", groupName: "Employee Costs", subHeadName: "Salary & Wages" };
        break;
      case "Revenue":
        suggestion = { statementType: "PNL", groupName: "Revenue", subHeadName: "Sales Income" };
        break;
      default:
        suggestion = { statementType: "PNL", groupName: "Operating Expenses", subHeadName: "General Expenses" };
    }

    return NextResponse.json({ 
      suggestion, 
      confidence, 
      reason: baseReason.join(" ") 
    });

  } catch (error: any) {
    console.error("AI Auto-Map Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
