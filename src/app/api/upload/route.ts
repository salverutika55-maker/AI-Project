import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const { records, clientId } = await req.json();

    if (!records || !Array.isArray(records) || !clientId) {
      return NextResponse.json({ message: "Invalid CSV payload or missing Client ID" }, { status: 400 });
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, userId: user.id },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    // Transform and map standard CSV to Prisma Model
    const cleanRecords = records.map((row: any) => ({
      clientId: client.id,
      source: "CSV",
      period: row.Period || new Date().toISOString().slice(0, 7),
      revenue: parseFloat(row.Revenue) || 0,
      cogs: parseFloat(row.COGS) || 0,
      operatingExpenses: parseFloat(row['Operating Expenses'] || row.OperatingExpenses) || 0,
      netIncome: parseFloat(row['Net Income'] || row.NetIncome) || 0,
      totalAssets: parseFloat(row['Total Assets'] || row.TotalAssets) || 0,
      currentAssets: parseFloat(row['Current Assets'] || row.CurrentAssets) || 0,
      currentLiabilities: parseFloat(row['Current Liabilities'] || row.CurrentLiabilities) || 0,
      totalEquity: parseFloat(row['Total Equity'] || row.TotalEquity) || 0,
      operatingCashFlow: parseFloat(row['Operating Cash Flow'] || row.OperatingCashFlow) || 0,
      cashBalance: parseFloat(row['Cash Balance'] || row.CashBalance) || 0,
      burnRate: parseFloat(row['Burn Rate'] || row.BurnRate) || 0,
      budgetedRevenue: parseFloat(row['Budgeted Revenue'] || row.BudgetedRevenue) || 0,
      budgetedExpenses: parseFloat(row['Budgeted Expenses'] || row.BudgetedExpenses) || 0,
    }));

    // Clear old CSV data to prevent duplicate period conflicts for MVP setup
    await prisma.financialRecord.deleteMany({
      where: { clientId: client.id, source: "CSV" },
    });

    await prisma.financialRecord.createMany({
      data: cleanRecords,
    });

    return NextResponse.json({ 
      message: "CSV Uploaded and Processed Successfully",
      count: cleanRecords.length
    }, { status: 200 });

  } catch (error: any) {
    console.error("Upload Error:", error);
    return NextResponse.json({ message: "Data Processing Failed: " + error.message }, { status: 500 });
  }
}
