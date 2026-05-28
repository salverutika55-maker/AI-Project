import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

/**
 * GET: Fetch raw records for a specific upload to review/map.
 * POST: Finalize mapping and move data to production PNLValue table.
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uploadId = searchParams.get("uploadId");

  if (!uploadId) return NextResponse.json({ error: "Upload ID Required" }, { status: 400 });

  const records = await prisma.rawLedgerRecord.findMany({
    where: { uploadId },
    orderBy: { ledgerName: 'asc' }
  });

  return NextResponse.json({ records });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { uploadId, mappings } = await req.json(); // mappings: { rawId: sectorHead }

    if (!uploadId || !mappings) {
      return NextResponse.json({ error: "Missing required data" }, { status: 400 });
    }

    const upload = await prisma.trialBalanceUpload.findUnique({
      where: { id: uploadId },
      include: { rawRecords: true }
    });

    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    // 1. Process each record according to mapping
    const pnlValuesToCreate: any[] = [];
    const newMappingsToCreate: any[] = [];

    // Group by sectorHead to aggregate amounts
    const aggregated: Record<string, number> = {};

    for (const record of upload.rawRecords) {
      const head = mappings[record.id];
      if (!head) continue; // Skip unmapped

      // Accumulate for PNLValue
      if (!aggregated[head]) aggregated[head] = 0;
      aggregated[head] += record.balance;

      // Ensure this mapping is saved for future uploads (Source: UPLOAD)
      newMappingsToCreate.push({
        clientId: upload.clientId,
        sectorHead: head,
        softwareLedgerName: record.ledgerName,
        source: "UPLOAD"
      });
    }

    // 2. Perform DB Updates in Transaction
    await prisma.$transaction(async (tx) => {
      // Save new mappings (upsert logic simplified here)
      for (const m of newMappingsToCreate) {
        const existing = await tx.pNLMapping.findFirst({
          where: { clientId: m.clientId, softwareLedgerName: m.softwareLedgerName }
        });
        if (!existing) {
          await tx.pNLMapping.create({ data: m });
        }
      }

      // Create PNLValue records
      // Note: period format "2024-03" needs to be split for dashboard compat
      // In this app, month is "Apr", "May" and year is 2026.
      // Let's parse the upload period
      const [yearStr, monthNum] = upload.period.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthName = monthNames[parseInt(monthNum) - 1];

      // Upsert PNL Values
      for (const [head, amount] of Object.entries(aggregated)) {
        const encryptedAmount = encrypt(amount.toString());
        await tx.pNLValue.upsert({
          where: {
            clientId_headName_month_year: {
              clientId: upload.clientId,
              headName: head,
              month: monthName,
              year: parseInt(yearStr)
            }
          },
          update: { amount: encryptedAmount },
          create: {
            clientId: upload.clientId,
            headName: head,
            month: monthName,
            year: parseInt(yearStr),
            amount: encryptedAmount
          }
        });
      }

      // 3. Mark upload as COMPLETED
      await tx.trialBalanceUpload.update({
        where: { id: uploadId },
        data: { status: "COMPLETED" }
      });
    });

    return NextResponse.json({ success: true, message: "Data finalized and P&L updated." });

  } catch (error: any) {
    console.error("Finalize Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
