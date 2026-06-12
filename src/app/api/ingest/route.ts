import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

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
      where: { id: apiKey },
      include: { pnlMappings: true }
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

    // Process records in chunks of 10 to avoid Prisma connection pool exhaustion
    const recordChunkSize = 10;
    for (let i = 0; i < records.length; i += recordChunkSize) {
      const chunk = records.slice(i, i + recordChunkSize);
      
      await Promise.all(chunk.map(async (record) => {
        const { period, source, ledgers, ...financials } = record;

        if (!period) {
          return; // Skip invalid rows missing mandatory 'period' string
        }

        const syncSource = source || "Webhook_API";

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
            accountsReceivable: financials.accountsReceivable || 0,
            accountsPayable: financials.accountsPayable || 0,
            inventory: financials.inventory || 0,
            budgetedRevenue: financials.budgetedRevenue || 0,
            budgetedExpenses: financials.budgetedExpenses || 0
          }
        });
        processedCount++;

        // Map and Save PNLValues for Detailed P&L
        if (syncSource !== "Tally Prime Agent" && record.ledgers && Object.keys(record.ledgers).length > 0 && client.pnlMappings) {
          const [yearStr, monthStr] = period.split("-");
          const dateObj = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
          const mShort = dateObj.toLocaleString('default', { month: 'short' });
          
          const monthNum = parseInt(monthStr);
          const syncYearToSave = monthNum < 4 ? parseInt(yearStr) - 1 : parseInt(yearStr);
          
          const headBalances: Record<string, number> = {};
          const accounts = record.ledgers;
          
          for (const m of client.pnlMappings) {
            const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
            let balance = 0;
            
            for (const alias of aliases) {
              const exactMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase() === alias);
              if (exactMatchKey) {
                balance += accounts[exactMatchKey];
              } else {
                const fuzzyMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase().includes(alias));
                if (fuzzyMatchKey) balance += accounts[fuzzyMatchKey];
              }
            }

            if (balance !== 0) {
              headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + Math.abs(balance);
            }
          }

          const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
            clientId: client.id,
            headName,
            month: mShort,
            year: syncYearToSave,
            amount: encrypt(balance.toString())
          }));

          if (finalEntries.length > 0) {
            await prisma.pNLValue.deleteMany({
              where: { clientId: client.id, month: mShort, year: syncYearToSave }
            });
            await prisma.pNLValue.createMany({ data: finalEntries });
          }
        }
      }));
    }

    // 4c. Update Unique Ledgers for the Mapping UI & Save Closing Balances
    if (client.software === 'TALLY') {
      const uniqueLedgers = new Map<string, { original: string, balance: number }>();
      
      // Since records are chronological, the last record has the latest Trial Balance
      for (const record of records) {
        if (record.ledgers) {
          Object.entries(record.ledgers).forEach(([k, v]) => {
             const original = k.trim();
             const lower = original.toLowerCase();
             uniqueLedgers.set(lower, { original, balance: Number(v) || 0 });
          });
        }
      }
      
      // Also add explicit chartOfAccounts if provided by the agent
      if (body.chartOfAccounts && Array.isArray(body.chartOfAccounts)) {
        body.chartOfAccounts.forEach((c: any) => {
             const original = typeof c === 'string' ? c.trim() : c.name.trim();
             const groupName = typeof c === 'string' ? "Unknown" : (c.groupName || "Unknown");
             const lower = original.toLowerCase();
             if (!uniqueLedgers.has(lower)) uniqueLedgers.set(lower, { original, balance: 0, groupName });
             else {
                 const existing = uniqueLedgers.get(lower);
                 if (existing) {
                     existing.groupName = groupName;
                 }
             }
        });
      }
      
      if (uniqueLedgers.size > 0) {
        const ledgersArr = Array.from(uniqueLedgers.values()).map(x => x.original);
        const encryptedLedgers = encrypt(JSON.stringify(ledgersArr));
        
        await prisma.integrationCredential.upsert({
          where: { clientId: client.id },
          create: {
            clientId: client.id,
            encryptedApiKey: encryptedLedgers
          },
          update: {
            encryptedApiKey: encryptedLedgers
          }
        });

        // Use $transaction to handle ledger updates
        await prisma.$transaction(async (tx) => {
          // 1. Update closing balances (Chunked to prevent Vercel 10s Timeout)
          const ledgerUpsertsData = Array.from(uniqueLedgers.values());
          const CHUNK_SIZE = 25;
          for (let i = 0; i < ledgerUpsertsData.length; i += CHUNK_SIZE) {
            const chunk = ledgerUpsertsData.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(async (data) => {
              const groupName = data.groupName || "Uncategorized";
              await tx.normalizedLedger.upsert({
                  where: {
                    clientId_name: {
                      clientId: client.id,
                      name: data.original
                    }
                  },
                  update: {
                    closingBalance: Math.abs(data.balance),
                    // Only update group name if the Tally agent actually sent a real group
                    ...(groupName !== "Unknown" && groupName !== "Uncategorized" ? { groupName } : {})
                  },
                  create: {
                    clientId: client.id,
                    name: data.original,
                    groupName: groupName,
                    closingBalance: Math.abs(data.balance),
                    nature: data.balance > 0 ? "DEBIT" : "CREDIT",
                    isActive: true
                  }
              });
            }));
          }
        });
      }
    }

    // 5. Resolve any pending UI sync tasks
    await prisma.syncTask.updateMany({
      where: {
        clientId: client.id,
        status: { in: ["PENDING", "PROCESSING"] }
      },
      data: {
        status: "COMPLETED",
        result: {
          message: client.pnlMappings?.length > 0 ? "Data successfully synced from desktop agent" : "Data synced successfully, but no Ledgers are Mapped! Please visit the Map Ledgers tab.",
          recordsProcessed: processedCount
        }
      }
    });

    return NextResponse.json({ 
      message: client.pnlMappings?.length > 0 ? "Data successfully ingested via API" : "Data ingested, but no PNL Mappings found.",
      client: client.name,
      recordsProcessed: processedCount,
      warning: client.pnlMappings?.length === 0 ? "Please configure your Ledger Mappings in the dashboard to view the Detailed P&L." : null
    }, { status: 200 });

  } catch (error) {
    console.error("Ingestion API Error:", error);
    return NextResponse.json({ message: "Internal Error during API Ingestion" }, { status: 500 });
  }
}
