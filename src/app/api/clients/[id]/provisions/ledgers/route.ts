import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";

export const dynamic = "force-dynamic";

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
  
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const rawLedgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { name: "asc" }
    });

    // Exclude basic group headers that might be in the table
    const tallyGroups = new Set([
      "branch / divisions", "capital account", "reserves & surplus", "current assets", 
      "bank accounts", "cash-in-hand", "deposits (asset)", "loans & advances (asset)", 
      "stock-in-hand", "sundry debtors", "current liabilities", "duties & taxes", 
      "provisions", "sundry creditors", "direct expenses", "direct incomes", 
      "fixed assets", "indirect expenses", "indirect incomes", "investments", 
      "loans (liability)", "bank od a/c", "secured loans", "unsecured loans", 
      "misc. expenses (as)", "purchase accounts", "sales accounts", "suspense a/c", "primary"
    ]);

    const ledgers = rawLedgers.filter(l => !tallyGroups.has(l.name.toLowerCase()));

    const classified = {
      assets: [] as any[],
      liabilities: [] as any[],
      income: [] as any[],
      expense: [] as any[]
    };

    ledgers.forEach(l => {
      const category = getLedgerCategory(l.groupName, l.nature);
      const item = { id: l.id, name: l.name, groupName: l.groupName, nature: l.nature };
      
      if (category === "ASSETS") classified.assets.push(item);
      else if (category === "LIABILITIES") classified.liabilities.push(item);
      else if (category === "INCOME") classified.income.push(item);
      else classified.expense.push(item);
    });

    return NextResponse.json(classified);
  } catch (error: any) {
    console.error("Fetch classified ledgers error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
