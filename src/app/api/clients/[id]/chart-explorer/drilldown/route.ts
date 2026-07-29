import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const MONTHS_LIST = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const metric = searchParams.get("metric") || "revenue_trend";
  const year = parseInt(searchParams.get("year") || "2026", 10);
  const month = searchParams.get("month") || "Mar";

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true }
    });

    // 1. Filter ledgers based on the selected metric
    let ledgerFilter = (l: typeof ledgers[0]) => false;

    if (metric === "revenue_trend" || metric === "sales_trend" || metric === "income_breakdown") {
      ledgerFilter = (l) => getLedgerCategory(l.groupName, l.nature) === "INCOME";
    } else if (metric === "expense_trend" || metric === "purchase_trend" || metric === "expense_breakdown") {
      ledgerFilter = (l) => getLedgerCategory(l.groupName, l.nature) === "EXPENSE";
    } else if (metric === "profit_trend" || metric === "financial_health" || metric === "profitability") {
      ledgerFilter = (l) => ["INCOME", "EXPENSE"].includes(getLedgerCategory(l.groupName, l.nature));
    } else if (metric === "cash_flow") {
      ledgerFilter = (l) => l.groupName.toLowerCase().includes("bank") || l.groupName.toLowerCase().includes("cash");
    } else if (metric === "working_capital" || metric === "liquidity" || metric === "working_capital_ratio") {
      ledgerFilter = (l) => ["current assets", "current liabilities", "sundry debtors", "sundry creditors", "bank accounts", "cash-in-hand", "provisions", "duties & taxes"].some(k => l.groupName.toLowerCase().includes(k));
    } else if (metric === "receivable_trend" || metric === "customer_concentration" || metric === "receivable_ageing") {
      ledgerFilter = (l) => l.groupName.toLowerCase().includes("debtor") || l.groupName.toLowerCase().includes("receivable");
    } else if (metric === "payable_trend" || metric === "vendor_concentration" || metric === "payable_ageing") {
      ledgerFilter = (l) => l.groupName.toLowerCase().includes("creditor") || l.groupName.toLowerCase().includes("payable");
    } else if (metric === "asset_trend") {
      ledgerFilter = (l) => getLedgerCategory(l.groupName, l.nature) === "ASSETS";
    } else if (metric === "liability_trend") {
      ledgerFilter = (l) => getLedgerCategory(l.groupName, l.nature) === "LIABILITIES";
    } else if (metric === "inventory_trend") {
      ledgerFilter = (l) => l.groupName.toLowerCase().includes("stock") || l.groupName.toLowerCase().includes("inventory");
    } else if (metric === "provision_trend") {
      ledgerFilter = (l) => l.groupName.toLowerCase().includes("provision");
    } else if (metric === "power_consumption") {
      ledgerFilter = (l) => ["power", "electricity", "fuel"].some(k => l.name.toLowerCase().includes(k));
    } else if (metric === "production_trend") {
      ledgerFilter = (l) => ["production", "factory", "manufacturing"].some(k => l.name.toLowerCase().includes(k)) || l.groupName.toLowerCase().includes("direct expenses");
    } else if (metric === "scrap_analysis") {
      ledgerFilter = (l) => l.name.toLowerCase().includes("scrap");
    } else if (metric === "inventory_movement") {
      ledgerFilter = (l) => l.groupName.toLowerCase().includes("stock");
    } else if (metric === "raw_material_consumption") {
      ledgerFilter = (l) => ["raw material", "rm cons", "material cons"].some(k => l.name.toLowerCase().includes(k));
    } else if (metric === "machine_repairs") {
      ledgerFilter = (l) => ["repair", "maintenance", "machinery"].every(k => l.name.toLowerCase().includes(k));
    } else if (metric === "employee_cost") {
      ledgerFilter = (l) => ["salary", "wages", "bonus", "employee", "pf contribution"].some(k => l.name.toLowerCase().includes(k));
    } else if (metric === "consultancy_revenue") {
      ledgerFilter = (l) => ["consultancy", "professional service", "advisory revenue"].some(k => l.name.toLowerCase().includes(k));
    } else if (metric === "unbilled_revenue") {
      ledgerFilter = (l) => l.name.toLowerCase().includes("unbilled") || l.name.toLowerCase().includes("accrued sales");
    } else if (metric === "advance_from_customers") {
      ledgerFilter = (l) => l.name.toLowerCase().includes("advance from customer") || l.name.toLowerCase().includes("unearned");
    } else if (metric === "project_revenue") {
      ledgerFilter = (l) => l.name.toLowerCase().includes("project");
    } else if (metric === "revenue_recognition") {
      ledgerFilter = (l) => l.name.toLowerCase().includes("deferred") || l.name.toLowerCase().includes("revenue rec");
    }

    const filteredLedgers = ledgers.filter(ledgerFilter);
    const sourceLedgers = filteredLedgers.map(l => ({
      id: l.id,
      name: l.name,
      groupName: l.groupName,
      nature: l.nature,
      closingBalance: l.closingBalance
    }));

    // 2. Fetch vouchers for the selected month and ledgers
    // Calculate month start/end bounds
    const monthIndex = MONTHS_LIST.indexOf(month);
    const actualMonthIndex = MONTH_SHORT_NAMES.indexOf(month);
    
    // Resolve target year for the calendar month
    const calendarYear = ["Jan", "Feb", "Mar"].includes(month) ? year + 1 : year;
    const startOfMonth = new Date(Date.UTC(calendarYear, actualMonthIndex, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(calendarYear, actualMonthIndex + 1, 0, 23, 59, 59, 999));

    const ledgerIds = filteredLedgers.map(l => l.id);

    const contributingLines = await prisma.normalizedVoucherLine.findMany({
      where: {
        ledgerId: { in: ledgerIds },
        voucher: {
          clientId: id,
          date: { gte: startOfMonth, lte: endOfMonth }
        }
      },
      include: {
        voucher: true,
        ledger: true
      },
      orderBy: { voucher: { date: "desc" } },
      take: 100 // Cap details for performance
    });

    const vouchers = contributingLines.map(line => ({
      id: line.voucher.id,
      date: line.voucher.date,
      voucherNumber: line.voucher.voucherNumber,
      voucherType: line.voucher.type,
      ledgerName: line.ledger.name,
      entryType: line.entryType,
      amount: Math.abs(line.amount),
      narration: line.voucher.narration
    }));

    return NextResponse.json({
      month,
      metric,
      sourceLedgers,
      vouchers
    });
  } catch (error: any) {
    console.error("GET chart explorer drilldown error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
