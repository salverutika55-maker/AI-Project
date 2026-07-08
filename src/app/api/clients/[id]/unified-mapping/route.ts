import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { recalculatePNLValues } from "@/lib/services/recalculate-statements";

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

    const client = await prisma.client.findUnique({
      where: { id },
      select: { software: true }
    });

    // Get COA from Normalized Ledgers
    let rawLedgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { name: "asc" }
    });

    // Filter out standard Tally Group Heads that might have been accidentally imported from CSVs
    const tallyGroups = new Set([
      "Branch / Divisions", "Capital Account", "Reserves & Surplus", "Current Assets", 
      "Bank Accounts", "Cash-in-hand", "Deposits (Asset)", "Loans & Advances (Asset)", 
      "Stock-in-hand", "Sundry Debtors", "Current Liabilities", "Duties & Taxes", 
      "Provisions", "Sundry Creditors", "Direct Expenses", "Direct Incomes", 
      "Fixed Assets", "Indirect Expenses", "Indirect Incomes", "Investments", 
      "Loans (Liability)", "Bank OD A/c", "Secured Loans", "Unsecured Loans", 
      "Misc. Expenses (AS)", "Purchase Accounts", "Sales Accounts", "Suspense A/c", "Primary"
    ].map(g => g.toLowerCase()));

    let chartOfAccounts = rawLedgers.filter(l => !tallyGroups.has(l.name.toLowerCase()));

    // Fallback/Merge with TallyVouchers to ensure no ledgers are missing
    if (client?.software === "TALLY") {
      const vouchers = await prisma.tallyVoucher.findMany({
        where: { clientId: id },
        select: { ledgerName: true },
        distinct: ['ledgerName']
      });
      
      const existingNames = new Set(chartOfAccounts.map(a => a.name.toLowerCase()));
      const missingLedgers = vouchers
        .filter(v => !existingNames.has((v.ledgerName || "").toLowerCase()))
        .map(v => ({
          id: v.ledgerName,
          name: v.ledgerName,
          groupName: "Unknown"
        }));
        
      chartOfAccounts = [...chartOfAccounts, ...missingLedgers as any];
      chartOfAccounts.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Also pull legacy PNL mappings to auto-populate if unified is empty
    const legacyPnl = await prisma.pNLMapping.findMany({
      where: { clientId: id }
    });

    let mappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: id }
    });

    // Auto-migrate legacy mappings to UI if they haven't been saved to unified yet
    if (mappings.length === 0 && legacyPnl.length > 0) {
      mappings = legacyPnl.map(m => ({
        id: m.id,
        clientId: id,
        softwareLedgerName: m.softwareLedgerName,
        statementType: "PNL",
        groupName: "Legacy Map",
        subGroupName: "",
        subHeadName: m.sectorHead,
        source: m.source,
        createdAt: m.createdAt,
        updatedAt: m.createdAt
      }));
    }

    const uiReturnedCount = chartOfAccounts.length;
    console.log(`[COA_TRACE] uiReturnedCount=${uiReturnedCount}`);

    return NextResponse.json({ 
      software: client?.software || "TALLY",
      chartOfAccounts,
      mappings 
    });

  } catch (error: any) {
    console.error("Unified Mapping Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
    
    // Only FINANCE_MANAGER or above can update mappings
    await authorizeClientAction(user.id, id, "FINANCE_MANAGER");

    const { mappings } = await req.json();

    if (!Array.isArray(mappings)) {
      return NextResponse.json({ error: "Invalid mappings array" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const validMappings = mappings.filter((m: any) => m.statementType && m.groupName);
      if (validMappings.length > 0) {
        const ledgerNames = validMappings.map((m: any) => m.softwareLedgerName);

        // 1. Bulk replace unified mappings
        await tx.unifiedLedgerMapping.deleteMany({
          where: { clientId: id, softwareLedgerName: { in: ledgerNames } }
        });
        
        await tx.unifiedLedgerMapping.createMany({
          data: validMappings.map((m: any) => ({
            clientId: id,
            softwareLedgerName: m.softwareLedgerName,
            statementType: m.statementType,
            groupName: m.groupName,
            subGroupName: m.subGroupName || null,
            subHeadName: m.subHeadName || m.groupName
          }))
        });

        // 2. Bulk replace legacy PNL mappings
        const pnlMappings = validMappings.filter((m: any) => m.statementType === "PNL");
        if (pnlMappings.length > 0) {
          const pnlLedgerNames = pnlMappings.map((m: any) => m.softwareLedgerName);
          await tx.pNLMapping.deleteMany({
            where: { clientId: id, softwareLedgerName: { in: pnlLedgerNames } }
          });

          await tx.pNLMapping.createMany({
            data: pnlMappings.map((m: any) => ({
              clientId: id,
              softwareLedgerName: m.softwareLedgerName,
              sectorHead: m.subHeadName || m.groupName,
              source: "SYNC"
            }))
          });
        }
      }
    });

    // After transaction succeeds, trigger statement recalculation for all relevant years
    try {
      const client = await prisma.client.findUnique({ where: { id } });
      if (client && client.software === "TALLY") {
        const vouchers = await prisma.normalizedVoucher.findMany({
          where: { clientId: id },
          select: { date: true }
        });
        
        const years = new Set<number>();
        for (const v of vouchers) {
           const date = new Date(v.date);
           const y = date.getUTCFullYear();
           const m = date.getUTCMonth(); // 0-indexed
          const fyStartYear = m < 3 ? y - 1 : y;
          years.add(fyStartYear);
        }

        console.log(`[Unified Mapping POST] Recalculating PNL for client ${id} for years:`, Array.from(years));
        for (const y of years) {
          await recalculatePNLValues(id, y);
        }
      }
    } catch (recalcErr) {
      console.error("[Unified Mapping POST] Post-save recalculation failed:", recalcErr);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Unified Mapping Save Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
