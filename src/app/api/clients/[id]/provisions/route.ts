import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { recalculatePNLValues } from "@/lib/services/recalculate-statements";

export const dynamic = "force-dynamic";

// Helper to determine category from groupName and nature
function getLedgerCategory(groupName: string, nature: string): "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSE" {
  const gp = groupName.toLowerCase();
  
  if (gp.includes("income") || gp.includes("revenue") || gp.includes("sales") || gp.includes("direct inc") || gp.includes("indirect inc")) {
    return "INCOME";
  }
  
  if (gp.includes("expense") || gp.includes("purchase") || gp.includes("depreciation") || gp.includes("finance cost") || gp.includes("direct exp") || gp.includes("indirect exp") || gp.includes("cost of")) {
    return "EXPENSE";
  }
  
  if (gp.includes("asset") || gp.includes("debtor") || gp.includes("bank") || gp.includes("cash") || gp.includes("investment") || gp.includes("stock") || gp.includes("advance") || gp.includes("receivable") || gp.includes("deposit")) {
    return "ASSETS";
  }
  
  if (gp.includes("liability") || gp.includes("creditor") || gp.includes("provision") || gp.includes("tax") || gp.includes("loan") || gp.includes("capital") || gp.includes("payable") || gp.includes("reserve") || gp.includes("surplus") || gp.includes("owner")) {
    return "LIABILITIES";
  }
  
  return nature === "DEBIT" ? "ASSETS" : "LIABILITIES";
}

// GET provisions list + month-end statistics
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2026", 10);

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const provisions = await prisma.provision.findMany({
      where: { clientId: id, financialYear: year },
      include: {
        debitLedger: true,
        creditLedger: true,
        createdBy: { select: { email: true } },
        reversedBy: { select: { email: true } }
      },
      orderBy: { createdDate: "desc" }
    });

    // Compute month-end report statistics
    let totalIncomeProvision = 0;
    let totalExpenseProvision = 0;
    let outstandingProvisions = 0;
    let reversedProvisions = 0;
    let pendingProvisions = 0;

    provisions.forEach(p => {
      if (p.provisionType === "INCOME") {
        totalIncomeProvision += p.amount;
      } else {
        totalExpenseProvision += p.amount;
      }

      if (p.status === "PENDING") {
        pendingProvisions += p.amount;
      } else if (p.status === "POSTED") {
        outstandingProvisions += p.amount;
      } else if (p.status === "REVERSED") {
        reversedProvisions += p.amount;
      }
    });

    return NextResponse.json({
      provisions,
      stats: {
        totalIncomeProvision,
        totalExpenseProvision,
        outstandingProvisions,
        reversedProvisions,
        pendingProvisions
      }
    });
  } catch (error: any) {
    console.error("GET provisions error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST create a provision and post double-entry journals
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

    // Restrict posting to qualified roles
    await authorizeClientAction(user.id, id, "FINANCE_MANAGER");

    const body = await req.json();
    const {
      provisionDate,
      financialYear,
      provisionType,
      debitLedgerId,
      creditLedgerId,
      amount,
      narration,
      effectiveMonth,
      reference,
      autoReverse,
      metadata // { department, costCentre }
    } = body;

    // 1. Core validations
    if (!provisionDate || !financialYear || !provisionType || !debitLedgerId || !creditLedgerId || !effectiveMonth) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    if (debitLedgerId === creditLedgerId) {
      return NextResponse.json({ error: "Debit and Credit ledgers cannot be identical" }, { status: 400 });
    }

    // 2. Ledger existence and category validations
    const debitLedger = await prisma.normalizedLedger.findFirst({
      where: { id: debitLedgerId, clientId: id, isActive: true }
    });
    const creditLedger = await prisma.normalizedLedger.findFirst({
      where: { id: creditLedgerId, clientId: id, isActive: true }
    });

    if (!debitLedger || !creditLedger) {
      return NextResponse.json({ error: "One or both selected ledgers are invalid or inactive" }, { status: 400 });
    }

    const debCategory = getLedgerCategory(debitLedger.groupName, debitLedger.nature);
    const credCategory = getLedgerCategory(creditLedger.groupName, creditLedger.nature);

    if (provisionType === "INCOME") {
      // Accrued Income (Asset) Dr   To Income Ledger
      if (debCategory !== "ASSETS") {
        return NextResponse.json({ error: `Debit Ledger (${debitLedger.name}) must belong to an Asset category, but got ${debCategory}.` }, { status: 400 });
      }
      if (credCategory !== "INCOME") {
        return NextResponse.json({ error: `Credit Ledger (${creditLedger.name}) must belong to an Income category, but got ${credCategory}.` }, { status: 400 });
      }
    } else if (provisionType === "EXPENSE") {
      // Expense Ledger Dr   To Outstanding Expense (Liability)
      if (debCategory !== "EXPENSE") {
        return NextResponse.json({ error: `Debit Ledger (${debitLedger.name}) must belong to an Expense category, but got ${debCategory}.` }, { status: 400 });
      }
      if (credCategory !== "LIABILITIES") {
        return NextResponse.json({ error: `Credit Ledger (${creditLedger.name}) must belong to a Liability category, but got ${credCategory}.` }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Invalid provision type" }, { status: 400 });
    }

    // 3. Prevent duplicate provisions
    const duplicate = await prisma.provision.findFirst({
      where: {
        clientId: id,
        provisionType,
        debitLedgerId,
        creditLedgerId,
        amount: numAmount,
        effectiveMonth,
        financialYear,
        status: { in: ["PENDING", "POSTED"] }
      }
    });

    if (duplicate) {
      return NextResponse.json({ error: "A matching active provision already exists in this period." }, { status: 400 });
    }

    // 4. Generate sequential Provision Number
    const count = await prisma.provision.count({
      where: { clientId: id, financialYear }
    });
    const seq = String(count + 1).padStart(4, "0");
    const provisionNumber = `PRV-${financialYear}-${seq}`;

    // 5. Post double-entry journal (NormalizedVoucher + Lines)
    // Debit is positive, Credit is negative in NormalizedVoucherLine.amount
    const dbDate = new Date(provisionDate);
    const voucher = await prisma.normalizedVoucher.create({
      data: {
        clientId: id,
        voucherNumber: provisionNumber,
        date: dbDate,
        type: "JOURNAL",
        narration: narration || `Provision entry ${provisionNumber}`,
        totalAmount: numAmount,
        referenceNo: reference || null,
        isManual: true,
        lines: {
          create: [
            {
              ledgerId: debitLedgerId,
              amount: numAmount,
              entryType: "DEBIT"
            },
            {
              ledgerId: creditLedgerId,
              amount: -numAmount,
              entryType: "CREDIT"
            }
          ]
        }
      }
    });

    // 6. Save Provision Record
    const provision = await prisma.provision.create({
      data: {
        clientId: id,
        provisionNumber,
        provisionDate: dbDate,
        financialYear,
        provisionType,
        debitLedgerId,
        creditLedgerId,
        amount: numAmount,
        narration,
        effectiveMonth,
        reference,
        autoReverse: !!autoReverse,
        status: "POSTED",
        voucherId: voucher.id,
        metadata: metadata || null,
        createdById: user.id
      }
    });

    // 7. Recalculate cached P&L statements so changes appear immediately
    await recalculatePNLValues(id, financialYear);

    return NextResponse.json(provision);
  } catch (error: any) {
    console.error("POST create provision error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
