import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeClientAction } from "@/lib/rbac";

export async function GET(
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

    // 1. Fetch current mappings
    const mappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: id }
    });

    // 2. Fetch all NormalizedLedgers to see ERP Group
    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id }
    });

    // 3. Fetch all vouchers to analyze behavior
    // For performance, we group by ledgerName
    const vouchers = await prisma.tallyVoucher.findMany({
      where: { clientId: id }
    });

    const behaviorMap: Record<string, any> = {};
    vouchers.forEach(v => {
      if (!behaviorMap[v.ledgerName]) {
        behaviorMap[v.ledgerName] = { purchaseCount: 0, paymentCount: 0, salesCount: 0, receiptCount: 0, total: 0, drSum: 0, crSum: 0 };
      }
      const type = v.voucherType.toLowerCase();
      behaviorMap[v.ledgerName].total++;
      if (type.includes("purchase")) behaviorMap[v.ledgerName].purchaseCount++;
      if (type.includes("sale")) behaviorMap[v.ledgerName].salesCount++;
      if (type.includes("payment")) behaviorMap[v.ledgerName].paymentCount++;
      if (type.includes("receipt")) behaviorMap[v.ledgerName].receiptCount++;
      
      if (v.isDebit) behaviorMap[v.ledgerName].drSum += v.amount;
      else behaviorMap[v.ledgerName].crSum += v.amount;
    });

    const exceptions: any[] = [];

    // Find case-insensitive duplicate ledgers in ERP
    const ledgerGroupMap = new Map<string, typeof ledgers>();
    for (const l of ledgers) {
      const lower = l.name.trim().toLowerCase();
      if (!ledgerGroupMap.has(lower)) {
        ledgerGroupMap.set(lower, []);
      }
      ledgerGroupMap.get(lower).push(l);
    }

    for (const [lower, list] of ledgerGroupMap.entries()) {
      if (list.length > 1) {
        const names = list.map(l => `"${l.name}"`).join(", ");
        exceptions.push({
          ledgerName: list[0].name,
          erpGroup: "ERP Collision",
          currentMapping: "Duplicate Ledgers",
          recommendedMapping: "Merge Ledgers",
          confidence: 100,
          reason: `Found duplicate ledgers in ERP: ${names} that differ only by case or whitespace. Please merge them in your ERP system to prevent mapping conflicts.`,
          type: "DUPLICATE_LEDGER",
          severity: "HIGH"
        });
      }
    }

    // Analyze each mapped ledger for anomalies
    mappings.forEach(mapping => {
      const ledgerName = mapping.softwareLedgerName;
      const ledger = ledgers.find(l => l.name === ledgerName);
      const erpGroup = ledger?.groupName.toLowerCase() || "";
      const behavior = behaviorMap[ledgerName];
      
      if (!behavior || behavior.total === 0) return; // Skip if no transactions

      const isMappedAsDebtor = mapping.subGroupName === "Trade Receivable";
      const isMappedAsCreditor = mapping.subGroupName === "Trade Payable";
      const isMappedAsAsset = mapping.groupName === "Current Assets" || mapping.groupName === "Non-Current Assets";
      const isMappedAsLiab = mapping.groupName === "Current Liabilities" || mapping.groupName === "Non-Current Liabilities";
      
      const pctPurchase = ((behavior.purchaseCount + behavior.paymentCount) / behavior.total) * 100;
      const pctSales = ((behavior.salesCount + behavior.receiptCount) / behavior.total) * 100;
      const isDebitBalance = behavior.drSum > behavior.crSum;

      // Rule 1: Mapped as Debtor but behaves like Creditor
      if (isMappedAsDebtor && pctPurchase > 70) {
        exceptions.push({
          ledgerName,
          erpGroup: ledger?.groupName,
          currentMapping: "Trade Receivables",
          recommendedMapping: "Trade Payables",
          confidence: Math.min(Math.round(pctPurchase + 10), 99),
          reason: `${pctPurchase.toFixed(0)}% of transactions are Purchases/Payments. This indicates a Vendor relationship.`,
          type: "MISCLASSIFIED_DEBTOR",
          severity: "HIGH"
        });
      }

      // Rule 2: Mapped as Creditor but behaves like Debtor
      else if (isMappedAsCreditor && pctSales > 70) {
        exceptions.push({
          ledgerName,
          erpGroup: ledger?.groupName,
          currentMapping: "Trade Payables",
          recommendedMapping: "Trade Receivables",
          confidence: Math.min(Math.round(pctSales + 10), 99),
          reason: `${pctSales.toFixed(0)}% of transactions are Sales/Receipts. This indicates a Customer relationship.`,
          type: "MISCLASSIFIED_CREDITOR",
          severity: "HIGH"
        });
      }

      // Rule 3: Balance Anomalies
      else if (isMappedAsAsset && !isMappedAsDebtor && !isDebitBalance && behavior.crSum > behavior.drSum * 1.5) {
        // e.g. An asset that has a massive credit balance
        exceptions.push({
          ledgerName,
          erpGroup: ledger?.groupName,
          currentMapping: mapping.groupName,
          recommendedMapping: "Review Classification",
          confidence: 75,
          reason: `Mapped as an Asset, but carries a strong abnormal Credit balance. Ensure it's not a liability or provision.`,
          type: "ABNORMAL_BALANCE",
          severity: "MEDIUM"
        });
      }
      
      else if (isMappedAsLiab && !isMappedAsCreditor && isDebitBalance && behavior.drSum > behavior.crSum * 1.5) {
        exceptions.push({
          ledgerName,
          erpGroup: ledger?.groupName,
          currentMapping: mapping.groupName,
          recommendedMapping: "Review Classification",
          confidence: 75,
          reason: `Mapped as a Liability, but carries a strong abnormal Debit balance. Ensure it's not an asset or advance.`,
          type: "ABNORMAL_BALANCE",
          severity: "MEDIUM"
        });
      }
    });

    return NextResponse.json({ exceptions });
  } catch (error: any) {
    console.error("Exception Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
