import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { parseTrialBalance } from "@/lib/parsers/tb-parser";
import { authorizeClientAction } from "@/lib/rbac";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const clientId = formData.get("clientId") as string;
    const period = formData.get("period") as string; // e.g. "2024-03"

    if (!file || !clientId || !period) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Get User
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 2. Authorize
    try {
      if (user.role !== "ADMIN") {
        await authorizeClientAction(user.id, clientId, Role.ORG_ADMIN);
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    // 3. Process File
    const buffer = Buffer.from(await file.arrayBuffer());
    const rawData = await parseTrialBalance(buffer);

    // 4. Create Upload Record
    const upload = await prisma.trialBalanceUpload.create({
      data: {
        clientId,
        fileName: file.name,
        fileSize: file.size,
        period,
        uploadedById: user.id,
        status: "MAPPING_REQUIRED",
      }
    });

    // 5. Store Raw Records in Staging
    // Chunking to prevent large payload issues in DB
    const chunkSize = 100;
    for (let i = 0; i < rawData.length; i += chunkSize) {
      const chunk = rawData.slice(i, i + chunkSize);
      await prisma.rawLedgerRecord.createMany({
        data: chunk.map(r => ({
          uploadId: upload.id,
          ledgerName: r.ledgerName,
          groupName: r.groupName,
          debit: r.debit,
          credit: r.credit,
          balance: r.balance
        }))
      });
    }

    return NextResponse.json({
      success: true,
      uploadId: upload.id,
      recordCount: rawData.length,
      message: "File uploaded and parsed. Mapping review required."
    });

  } catch (error: any) {
    console.error("TB Upload Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
