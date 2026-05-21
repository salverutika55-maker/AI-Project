import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { authorizeClientAction } from "@/lib/rbac";
import { normalizeClientAccountingData } from "@/lib/services/ingestion";
import { runAllScrutinyRules } from "@/lib/services/scrutiny-rules";

export const dynamic = "force-dynamic";

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

    // Validate permission
    await authorizeClientAction(user.id, id, "ACCOUNTANT");

    const body = await req.json();
    const year = parseInt(body.year || "2026");

    // 1. Run Data Ingestion and Normalization first to sync latest data
    await normalizeClientAccountingData(id);

    // 2. Clear out older pending alerts to prevent duplicated stale flags
    await prisma.scrutinyAlert.deleteMany({
      where: {
        clientId: id,
        status: "PENDING"
      }
    });

    // 3. Execute Scrutiny Rule Audit Matrix & NLP Narration Scans
    const runResult = await runAllScrutinyRules(id, year);

    return NextResponse.json({
      success: true,
      totalAlerts: runResult.totalAlerts,
      details: runResult.details
    });
  } catch (error: any) {
    console.error("Scrutiny Run API Execution Error:", error);
    return NextResponse.json({ error: error.message || "Failed to execute Scrutiny matrix" }, { status: 500 });
  }
}
