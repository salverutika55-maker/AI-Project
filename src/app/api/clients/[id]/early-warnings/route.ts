import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { calculateEarlyWarnings } from "@/lib/services/early-warning-engine";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  // 1. Authenticate user session
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 2. Authorize tenant/client access
    await authorizeClientAction(user.id, id, "READ_ONLY");

    // 3. Compute live, data-driven early warnings
    const warningsResult = await calculateEarlyWarnings(id, year);

    return NextResponse.json({
      success: true,
      data: warningsResult
    });
  } catch (error: any) {
    console.error(`Early Warnings calculation error for client ${id}:`, error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate early warning alerts" },
      { status: 500 }
    );
  }
}
