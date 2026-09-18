import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { generateCfoMisReport } from "@/lib/services/cfo-mis-engine";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString(), 10);
  const month = searchParams.get("month") || "Apr";
  const fyType = searchParams.get("fyType") || "APR_MAR";

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await authorizeClientAction(user.id, id, "READ_ONLY");

    // Generate full CFO MIS Insight Engine Report
    const report = await generateCfoMisReport(id, year, month, fyType);

    return new NextResponse(
      JSON.stringify(report),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
        }
      }
    );
  } catch (error: any) {
    console.error("AI CFO Report Generation Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate CFO MIS report" }, { status: 500 });
  }
}
