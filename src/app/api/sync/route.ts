import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Helper to generate an array of "YYYY-MM" strings between start and end inclusive
function generatePeriods(startStr: string, endStr: string) {
  const start = new Date(startStr + "-01");
  const end = new Date(endStr + "-01");
  const periods = [];
  
  if (start > end) return [startStr]; // Fallback

  let current = new Date(start);
  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    periods.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }
  return periods;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { source, clientId, startDate, endDate } = body; 

    if (!source || !clientId) {
      return NextResponse.json({ message: "Integration Source and Client ID Required" }, { status: 400 });
    }

    const startPeriod = startDate || "2023-01";
    const endPeriod = endDate || "2023-12";

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

    // Generate accurate months array based on selection
    const periods = generatePeriods(startPeriod, endPeriod);
    
    // Clear old mock data if exists for this client to simulate fresh sync
    await prisma.financialRecord.deleteMany({
      where: { clientId: client.id, source },
    });

    // Create realistic trending data scalable by length
    let baseRevenue = 150000;
    let baseCash = 300000;

    const mockRecords = periods.map((period, index) => {
      // Add standard market volatility to trends
      const volatility = (Math.random() - 0.2) * 30000; 
      baseRevenue += Math.floor(volatility); // Can trend up or slightly down
      if (baseRevenue < 50000) baseRevenue = 50000;

      const cogs = baseRevenue * 0.35; // 35% COGS
      const operatingExpenses = 70000 + (index * 1000); // Gradual opex bleed
      const netIncome = baseRevenue - cogs - operatingExpenses;
      
      baseCash += netIncome; // Add net income to cash reserves
      if (baseCash < 0) baseCash = 10000; // prevent bankrupt mock

      return {
        clientId: client.id,
        period,
        source,
        revenue: baseRevenue,
        cogs,
        operatingExpenses,
        netIncome,
        totalAssets: 1200000 + (index * 25000),
        currentAssets: baseCash + 150000,
        currentLiabilities: 80000 + (index * 5000),
        totalEquity: 800000 + (index * 20000),
        operatingCashFlow: netIncome + 10000, 
        cashBalance: baseCash,
        burnRate: operatingExpenses + cogs,
        budgetedRevenue: baseRevenue * 0.95, 
        budgetedExpenses: operatingExpenses * 1.05
      };
    });

    await prisma.financialRecord.createMany({
      data: mockRecords,
    });

    return NextResponse.json({ 
      message: `${source} Authenticated & Synchronized`,
      count: mockRecords.length
    }, { status: 200 });

  } catch (error) {
    console.error("Sync Error:", error);
    return NextResponse.json({ message: "Internal Error during Synchronization" }, { status: 500 });
  }
}
