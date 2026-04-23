import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // 1. Authenticate via Bearer Token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const apiKey = authHeader.split('Bearer ')[1].trim();

    // 2. Find the client by API Key
    const client = await prisma.client.findUnique({
      where: { apiKey }
    });

    if (!client) {
      return NextResponse.json({ message: "Invalid API Key" }, { status: 401 });
    }

    // 3. Parse JSON Body payload
    const body = await req.json();
    
    // Support either single object, array of objects, or object with 'records' array
    let records = [];
    if (Array.isArray(body)) {
      records = body;
    } else if (body.records && Array.isArray(body.records)) {
      records = body.records;
    } else {
      records = [body];
    }

    if (records.length === 0) {
      return NextResponse.json({ message: "Payload empty" }, { status: 400 });
    }

    let processedCount = 0;

    for (const record of records) {
      const { period, source, ...financials } = record;

      if (!period) {
        continue; // Skip invalid rows missing mandatory 'period' string (e.g. "2024-01")
      }

      const syncSource = source || "Webhook_API";

      // 4. Implement Upsert Logic
      // Since [clientId, period] is a unique compound index, we intelligently
      // overwrite existing data for that period to prevent duplicate entries
      await prisma.financialRecord.upsert({
        where: {
          clientId_period: {
            clientId: client.id,
            period: period
          }
        },
        update: {
          source: syncSource,
          ...financials
        },
        create: {
          clientId: client.id,
          period,
          source: syncSource,
          revenue: financials.revenue || 0,
          cogs: financials.cogs || 0,
          operatingExpenses: financials.operatingExpenses || 0,
          netIncome: financials.netIncome || 0,
          totalAssets: financials.totalAssets || 0,
          currentAssets: financials.currentAssets || 0,
          currentLiabilities: financials.currentLiabilities || 0,
          totalEquity: financials.totalEquity || 0,
          operatingCashFlow: financials.operatingCashFlow || 0,
          cashBalance: financials.cashBalance || 0,
          burnRate: financials.burnRate || 0,
          budgetedRevenue: financials.budgetedRevenue || 0,
          budgetedExpenses: financials.budgetedExpenses || 0
        }
      });
      processedCount++;
    }

    return NextResponse.json({ 
      message: "Data successfully ingested via API",
      client: client.name,
      recordsProcessed: processedCount
    }, { status: 200 });

  } catch (error) {
    console.error("Ingestion API Error:", error);
    return NextResponse.json({ message: "Internal Error during API Ingestion" }, { status: 500 });
  }
}
