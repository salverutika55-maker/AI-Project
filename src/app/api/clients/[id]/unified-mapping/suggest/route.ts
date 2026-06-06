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
    // See how similar ledgers were mapped in the past by this company
    const similarMappings = await prisma.unifiedLedgerMapping.findMany({
      where: { 
        clientId: id,
        softwareLedgerName: { contains: nameStr.split(' ')[0] } // basic similarity
      }
    });

    let existingMappingPreference = null;
    if (similarMappings.length > 0) {
      // Find the most common mapping for similar ledgers
      const frequency: Record<string, number> = {};
      similarMappings.forEach(m => {
        if (m.subGroupName) {
          frequency[m.subGroupName] = (frequency[m.subGroupName] || 0) + 1;
        }
      });
      existingMappingPreference = Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
    }

    // 2. Fetch Transactions / Voucher Behavior (Layer 2 & 3)
    const vouchers = await prisma.tallyVoucher.findMany({
      where: { clientId: id, ledgerName: ledgerName }
    });

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
    const ledger = await prisma.normalizedLedger.findFirst({
      where: { clientId: id, name: ledgerName }
    });
    
    // Balance Analysis: if transactions exist, we calculate balance, otherwise fallback to normalized nature.
    const isDebitBalance = totalVouchers > 0 ? (debitSum > creditSum) : (ledger ? ledger.nature === "DEBIT" : false);

    // --- BEHAVIORAL AI SCORING ENGINE (100 Point Scale) ---
    
    let aiScores: Record<string, number> = {
      "Trade Receivable": 0,
      "Trade Payable": 0,
      "Duties & Taxes": 0,
      "Fixed Assets": 0,
      "Bank Accounts": 0,
      "Cash-In-Hand": 0,
      "Operating Expenses": 0,
      "Direct Expenses": 0,
      "Employee Costs": 0,
      "Revenue": 0
    };

    let reasons: string[] = [];

    // Factor 1: ERP Group Match (Max 20 Points)
    if (groupStr.includes("debtor")) { aiScores["Trade Receivable"] += 20; }
    if (groupStr.includes("creditor")) { aiScores["Trade Payable"] += 20; }
    if (groupStr.includes("indirect expense")) { aiScores["Operating Expenses"] += 20; }
    if (groupStr.includes("direct expense")) { aiScores["Direct Expenses"] += 20; }
    if (groupStr.includes("fixed asset")) { aiScores["Fixed Assets"] += 20; }
    if (groupStr.includes("bank") || groupStr.includes("cash")) { aiScores["Bank Accounts"] += 20; aiScores["Cash-In-Hand"] += 20; }

    // Factor 2: Ledger Name Analysis (Max 20 Points)
    if (nameStr.includes("supplier") || nameStr.includes("vendor") || nameStr.includes("payable") || nameStr.includes("creditor")) {
      aiScores["Trade Payable"] += 20;
      reasons.push("Ledger name indicates a vendor/supplier relationship.");
    }
    if (nameStr.includes("customer") || nameStr.includes("buyer") || nameStr.includes("receivable") || nameStr.includes("debtor") || nameStr.includes("client")) {
      aiScores["Trade Receivable"] += 20;
      reasons.push("Ledger name indicates a customer relationship.");
    }
    if (nameStr.includes("salary") || nameStr.includes("wage") || nameStr.includes("pf")) {
      aiScores["Employee Costs"] += 20;
      reasons.push("Ledger name indicates payroll or employee expense.");
    }
    if (nameStr.includes("gst") || nameStr.includes("tax") || nameStr.includes("tds") || nameStr.includes("cgst") || nameStr.includes("sgst")) {
      aiScores["Duties & Taxes"] += 20;
      reasons.push("Ledger name indicates statutory taxation.");
    }

    // Factor 3 & 4: Transaction Behavior & Counter Ledger Analysis (Combined Max 40 Points)
    // We use voucher types as a proxy for counter-ledgers (e.g. Sales Voucher implies Revenue counter ledger)
    if (totalVouchers > 0) {
      let pctPurchase = ((purchaseCount + paymentCount) / totalVouchers) * 100;
      let pctSales = ((salesCount + receiptCount) / totalVouchers) * 100;

      if (pctPurchase > 50) {
        let awardedPoints = Math.round((pctPurchase / 100) * 40);
        aiScores["Trade Payable"] += awardedPoints;
        reasons.push(`${pctPurchase.toFixed(0)}% of transactions are Purchases or Vendor Payments.`);
      }
      if (pctSales > 50) {
        let awardedPoints = Math.round((pctSales / 100) * 40);
        aiScores["Trade Receivable"] += awardedPoints;
        reasons.push(`${pctSales.toFixed(0)}% of transactions are Sales or Customer Receipts.`);
      }
    } else {
      // If no vouchers, we can't award 40 points for behavior. We boost the existing weights to compensate.
      // E.g., if ERP Group says Debtor and Name has no strong hints, we must still be confident.
      if (groupStr.includes("debtor")) { aiScores["Trade Receivable"] += 35; reasons.push("Mapped based on strict ERP group due to zero transaction history."); }
      if (groupStr.includes("creditor")) { aiScores["Trade Payable"] += 35; reasons.push("Mapped based on strict ERP group due to zero transaction history."); }
    }

    // Factor 5: Balance / Narration Analysis (Max 10 Points)
    if (isDebitBalance) {
      aiScores["Trade Receivable"] += 10;
      aiScores["Fixed Assets"] += 10;
      aiScores["Operating Expenses"] += 10;
      aiScores["Trade Payable"] -= 15; // Strongly penalize Vendor if it carries debit balance
      if (aiScores["Trade Receivable"] > 0) reasons.push("Predominantly Debit balance aligns with Asset/Receivable nature.");
    } else {
      aiScores["Trade Payable"] += 10;
      aiScores["Duties & Taxes"] += 10;
      aiScores["Revenue"] += 10;
      aiScores["Trade Receivable"] -= 15; // Strongly penalize Customer if it carries credit balance
      if (aiScores["Trade Payable"] > 0) reasons.push("Predominantly Credit balance aligns with Liability/Payable nature.");
    }

    // Factor 6: Existing Company Mapping Similarity (Max 10 Points)
    if (existingMappingPreference) {
      if (aiScores[existingMappingPreference] !== undefined) {
        aiScores[existingMappingPreference] += 10;
        reasons.push(`Similar to other ledgers mapped as ${existingMappingPreference} in your structure.`);
      }
    }

    // --- FINALIZE SCORE AND CATEGORY ---
    let highestCategory = "Operating Expenses"; // fallback
    let highestScore = 0;
    
    for (const [cat, score] of Object.entries(aiScores)) {
      if (score > highestScore) {
        highestScore = score;
        highestCategory = cat;
      }
    }

    // Normalize confidence to 0-100% bounds
    let confidence = Math.max(0, Math.min(highestScore, 99));

    // Special Condition: Perfect Match (Everything aligns perfectly)
    if (
      (highestCategory === "Trade Receivable" && groupStr.includes("debtor") && isDebitBalance && (totalVouchers === 0 || salesCount > 0)) ||
      (highestCategory === "Trade Payable" && groupStr.includes("creditor") && !isDebitBalance && (totalVouchers === 0 || purchaseCount > 0))
    ) {
      confidence = Math.max(confidence, 92); // Automatically boost to Very High if everything perfectly aligns.
    }

    // Misclassification Anomaly Detection Override
    if (groupStr.includes("debtor") && highestCategory === "Trade Payable") {
      reasons.unshift("⚠️ ERP MISCLASSIFICATION: Grouped as Debtors in ERP, but behavior/balance strongly indicates a Creditor.");
      confidence = Math.max(confidence, 85); // We are confident it's wrong in ERP
    } else if (groupStr.includes("creditor") && highestCategory === "Trade Receivable") {
      reasons.unshift("⚠️ ERP MISCLASSIFICATION: Grouped as Creditors in ERP, but behavior/balance strongly indicates a Debtor.");
      confidence = Math.max(confidence, 85);
    }

    // Assign Confidence Categories
    let confidenceCategory = "MANUAL_REVIEW";
    if (confidence >= 95) confidenceCategory = "VERY_HIGH";
    else if (confidence >= 85) confidenceCategory = "HIGH";
    else if (confidence >= 70) confidenceCategory = "MODERATE";

    if (confidence < 70) {
      reasons.push("Low confidence score. Manual review is required.");
    }

    // Ensure we don't return duplicate reasons
    reasons = Array.from(new Set(reasons));

    // Map Category to precise unified schema
    let suggestion = null;
    switch (highestCategory) {
      case "Trade Receivable":
        suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Trade Receivable", subHeadName: "Trade Debtors" };
        break;
      case "Trade Payable":
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
      confidenceCategory,
      reasons 
    });

  } catch (error: any) {
    console.error("AI Auto-Map Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
