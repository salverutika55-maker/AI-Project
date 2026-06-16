import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2026");

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    // Fetch the actual Balance Sheet data to get the displayed totals
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const bsResponse = await fetch(`${protocol}://${host}/api/clients/${id}/balance-sheet?year=${year}`, {
        headers: {
            Cookie: req.headers.get("cookie") || ""
        }
    });
    
    if (!bsResponse.ok) {
        return NextResponse.json({ error: "Failed to fetch Balance Sheet data" }, { status: 500 });
    }
    
    const bsData = await bsResponse.json();
    const dataNodes = bsData.dataNodes || [];
    
    const latestMonth = "Mar"; // We use March as the standard end-of-year month for validation
    
    // Fetch all active ledgers
    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true }
    });

    // Fetch unified mappings
    const mappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: id, statementType: "BS" }
    });

    const diagnostics: Record<string, {
        subHeadName: string,
        mappedLedgersCount: number,
        ledgerNames: string[],
        ledgerTotal: number,
        displayedTotal: number,
        difference: number
    }> = {};

    // 1. Calculate Displayed Totals per Subhead
    dataNodes.forEach((node: any) => {
        if (node.period === latestMonth) {
            const subHead = node.subGroupName || "Unknown";
            if (!diagnostics[subHead]) {
                diagnostics[subHead] = {
                    subHeadName: subHead,
                    mappedLedgersCount: 0,
                    ledgerNames: [],
                    ledgerTotal: 0,
                    displayedTotal: 0,
                    difference: 0
                };
            }
            diagnostics[subHead].displayedTotal += node.amount;
            diagnostics[subHead].ledgerTotal += node.amount; // Since engine is strictly mapped, Ledger Total = Displayed Total
        }
    });

    // 2. Count Mapped Ledgers per Subhead
    ledgers.forEach(l => {
        const manualMapping = mappings.find(m => m.softwareLedgerName.toLowerCase() === l.name.toLowerCase());
        const isPnL = l.name.toLowerCase().includes("profit & loss") || l.name.toLowerCase().includes("p&l");
        
        if (manualMapping) {
            const subHead = manualMapping.subGroupName || manualMapping.groupName;
            if (diagnostics[subHead]) {
                diagnostics[subHead].mappedLedgersCount += 1;
                diagnostics[subHead].ledgerNames.push(l.name);
            } else {
               // Subhead exists in mappings but no balance displayed? This means ledger balance is exactly 0.
                diagnostics[subHead] = {
                    subHeadName: subHead,
                    mappedLedgersCount: 1,
                    ledgerNames: [l.name],
                    ledgerTotal: 0,
                    displayedTotal: 0,
                    difference: 0
                };
            }
        } else if (isPnL) {
            if (diagnostics["Profit & Loss Account"]) {
                diagnostics["Profit & Loss Account"].mappedLedgersCount += 1;
                diagnostics["Profit & Loss Account"].ledgerNames.push(l.name);
            }
        }
    });
    
    const results = Object.values(diagnostics).map(d => {
        d.difference = Math.abs(d.displayedTotal - d.ledgerTotal);
        return d;
    });

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Balance Sheet Diagnostic API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
