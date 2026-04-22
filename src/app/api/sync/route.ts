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

    const body = await req.json();
    const { source, clientId } = body; // e.g. Tally Prime, Xero, Odoo

    if (!source || !clientId) {
      return NextResponse.json({ message: "Integration Source and Client ID Required" }, { status: 400 });
    }

    // Fetch the User ID based on session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Verify the client belongs to the user
    const client = await prisma.client.findFirst({
      where: { id: clientId, userId: user.id },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found or unauthorized" }, { status: 404 });
    }

    // Generate 6 months of robust mock financial data
    const periods = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"];
    
    // Clear old mock data if exists for this client to simulate fresh sync
    await prisma.financialRecord.deleteMany({
      where: { clientId: client.id, source },
    });

    // Create realistic trending data
    let baseRevenue = 150000;
    let baseCash = 300000;

    const mockRecords = periods.map((period, index) => {
      baseRevenue += Math.floor(Math.random() * 20000); // Trend upwards slightly
      const cogs = baseRevenue * 0.35; // 35% COGS
      const operatingExpenses = 70000;
      const netIncome = baseRevenue - cogs - operatingExpenses;
      
      baseCash += netIncome; // Add net income to cash

      return {
        clientId: client.id,
        period,
        source,
        revenue: baseRevenue,
        cogs,
        operatingExpenses,
        netIncome,
        totalAssets: 1200000 + (index * 50000),
        currentAssets: baseCash + 150000,
        currentLiabilities: 80000,
        totalEquity: 800000 + (index * 40000),
        operatingCashFlow: netIncome + 10000, // Non-cash adjustments
        cashBalance: baseCash,
        burnRate: operatingExpenses + cogs,
        budgetedRevenue: baseRevenue * 0.95, // Usually slightly behind actual in good months
        budgetedExpenses: operatingExpenses * 1.05
      };
    });

    await prisma.financialRecord.createMany({
      data: mockRecords,
    });

    return NextResponse.json({ 
      message: `${source} Successfully Synchronized`,
      count: mockRecords.length
    }, { status: 200 });

  } catch (error) {
    console.error("Sync Error:", error);
    return NextResponse.json({ message: "Internal Error during Synchronization" }, { status: 500 });
  }
}
