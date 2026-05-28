import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeClientAction } from "@/lib/rbac";
import { Role } from "@prisma/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period"); // e.g. "2026-05"

    if (!period) {
      return NextResponse.json({ error: "Missing period parameter" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // RBAC Authorization check
    try {
      if (user.role !== "ADMIN") {
        await authorizeClientAction(user.id, clientId, Role.ACCOUNTANT);
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    // Retrieve reconciliation states
    const states = await prisma.reconciliationState.findMany({
      where: {
        clientId,
        statementPeriod: period
      }
    });

    return NextResponse.json({
      success: true,
      states
    });

  } catch (error: any) {
    console.error("Fetch reconciliation status error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
