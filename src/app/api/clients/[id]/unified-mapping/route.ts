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
    const chartOfAccounts = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { name: "asc" }
    });

    const mappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: id }
    });

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
      // 1. Delete all existing unified mappings for this client
      await tx.unifiedLedgerMapping.deleteMany({
        where: { clientId: id }
      });

      // 2. Insert new unified mappings
      if (mappings.length > 0) {
        await tx.unifiedLedgerMapping.createMany({
          data: mappings.map((m: any) => ({
            clientId: id,
            softwareLedgerName: m.softwareLedgerName,
            statementType: m.statementType,
            groupName: m.groupName,
            subGroupName: m.subGroupName || null,
            subHeadName: m.subHeadName
          }))
        });
      }

      // 3. For backward compatibility with P&L syncing, sync down to PNLMapping
      // If statementType is PNL, it goes to PNLMapping
      const pnlMappings = mappings.filter((m: any) => m.statementType === "PNL");
      await tx.pNLMapping.deleteMany({
        where: { clientId: id, source: "SYNC" }
      });
      
      if (pnlMappings.length > 0) {
        await tx.pNLMapping.createMany({
          data: pnlMappings.map((m: any) => ({
            clientId: id,
            softwareLedgerName: m.softwareLedgerName,
            sectorHead: m.subHeadName, // Old PNLMapping used sectorHead for the line item
            source: "SYNC"
          }))
        });
      }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Unified Mapping Save Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
