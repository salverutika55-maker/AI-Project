import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { GSTReconciliationEngine } from "@/lib/gst/services/GSTReconciliationEngine";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period"); // e.g. "2026-03"
  const type = searchParams.get("type") || "ALL"; // "GSTR1", "GSTR2B", "GSTR3B", "ALL"

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Valid return period (YYYY-MM) is required." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const [salesRecon, itcRecon, gstr3bRecon, returnStatuses] = await Promise.all([
      (type === "GSTR1" || type === "ALL") ? GSTReconciliationEngine.reconcileGSTR1(id, period) : null,
      (type === "GSTR2B" || type === "ALL") ? GSTReconciliationEngine.reconcileGSTR2B(id, period) : null,
      (type === "GSTR3B" || type === "ALL") ? GSTReconciliationEngine.reconcileGSTR3B(id, period) : null,
      prisma.gSTReturnStatus.findMany({ where: { clientId: id, returnPeriod: period } })
    ]);

    return NextResponse.json({
      period,
      salesRecon,
      itcRecon,
      gstr3bRecon,
      returnStatuses
    });
  } catch (err: any) {
    console.error("Error executing GST reconciliation:", err);
    return NextResponse.json({ error: err?.message || "Failed to execute GST reconciliation." }, { status: 500 });
  }
}
