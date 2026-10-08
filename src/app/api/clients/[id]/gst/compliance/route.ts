import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { GSTComplianceEngine } from "@/lib/gst/services/GSTComplianceEngine";
import { GSTInsightService } from "@/lib/gst/services/GSTInsightService";

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
  const period = searchParams.get("period");

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Valid return period (YYYY-MM) is required." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const [compliance, insights] = await Promise.all([
      GSTComplianceEngine.evaluateCompliance(id, period),
      GSTInsightService.generateInsights(id, period)
    ]);

    return NextResponse.json({
      period,
      compliance,
      insights
    });
  } catch (err: any) {
    console.error("Error evaluating GST compliance and insights:", err);
    return NextResponse.json({ error: err?.message || "Failed to generate compliance data." }, { status: 500 });
  }
}
