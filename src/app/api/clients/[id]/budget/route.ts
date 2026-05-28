import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import { logSecurityEvent } from "@/lib/logger";

const MONTHS_APR_MAR = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MONTHS_JAN_DEC = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Helper to determine months based on FY type and period
function getMonthsForPeriod(period: string, fyType: "Apr-Mar" | "Jan-Dec"): string[] {
  const p = period.toUpperCase();
  const months = fyType === "Apr-Mar" ? MONTHS_APR_MAR : MONTHS_JAN_DEC;
  
  if (p === "Q1") return [months[0], months[1], months[2]];
  if (p === "Q2") return [months[3], months[4], months[5]];
  if (p === "Q3") return [months[6], months[7], months[8]];
  if (p === "Q4") return [months[9], months[10], months[11]];
  
  // If it's a direct month match
  const matched = months.find(m => m.toUpperCase() === p.substring(0, 3));
  if (matched) return [matched];
  
  return [];
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { fyType, year, mappings, values } = body;

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ 
      where: { email: session.user.email },
      include: { memberships: { where: { status: "APPROVED" } } }
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const orgIds = user.memberships.map(m => m.organizationId);
    const hasAccess = user.role === "ADMIN" || orgIds.includes(client.organizationId);

    if (!hasAccess) {
      await logSecurityEvent(user.id, "UNAUTHORIZED_BUDGET_UPLOAD", id, "Attempted unauthorized budget upload", req);
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    // Process values into monthly buckets based on standard heads
    const aggregatedMonthlyValues: Record<string, Record<string, number>> = {}; // { StandardHead: { Month: Amount } }

    values.forEach((v: any) => {
      // Find the standard head mapped to this custom ledger
      const mapping = mappings.find((m: any) => m.csvLedgerName === v.headName);
      if (!mapping || !v.amount || isNaN(Number(v.amount))) return;
      
      const standardHead = mapping.sectorHead;
      const targetMonths = getMonthsForPeriod(v.period, fyType);
      
      if (targetMonths.length === 0) return; // Unrecognized period
      
      const splitAmount = Number(v.amount) / targetMonths.length; // E.g., Q1 splits amount by 3
      
      if (!aggregatedMonthlyValues[standardHead]) aggregatedMonthlyValues[standardHead] = {};
      
      targetMonths.forEach(m => {
        aggregatedMonthlyValues[standardHead][m] = (aggregatedMonthlyValues[standardHead][m] || 0) + splitAmount;
      });
    });

    // Save Data to DB
    const txs: any[] = [];

    // 1. Save Mappings
    if (mappings && mappings.length > 0) {
      txs.push(prisma.budgetMapping.deleteMany({ where: { clientId: id } }));
      txs.push(prisma.budgetMapping.createMany({
        data: mappings.map((m: any) => ({
          clientId: id,
          sectorHead: m.sectorHead,
          csvLedgerName: m.csvLedgerName
        }))
      }));
    }

    // 2. Save Encrypted Values
    const valuePromises = Object.entries(aggregatedMonthlyValues).flatMap(([head, monthData]) => {
      return Object.entries(monthData).map(([month, amount]) => {
        
        // Year Calculation: If FY is Apr-Mar, months Jan-Mar belong to the NEXT calendar year.
        let actualYear = Number(year);
        if (fyType === "Apr-Mar" && ["Jan", "Feb", "Mar"].includes(month)) {
          actualYear += 1;
        }

        const encryptedAmount = encrypt(String(amount));

        return prisma.budgetValue.upsert({
          where: {
            clientId_headName_month_year: {
              clientId: id,
              headName: head,
              month,
              year: actualYear
            }
          },
          update: { amount: encryptedAmount },
          create: {
            clientId: id,
            headName: head,
            month,
            year: actualYear,
            amount: encryptedAmount
          }
        });
      });
    });

    // Execute in transaction
    await prisma.$transaction([...txs, ...valuePromises]);

    await logSecurityEvent(user.id, "BUDGET_UPLOAD_SUCCESS", id, `Processed budget for FY ${year} (${fyType})`, req);

    return NextResponse.json({ success: true, message: "Budget perfectly processed and encrypted!" });

  } catch (error: any) {
    console.error("Budget Upload Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
