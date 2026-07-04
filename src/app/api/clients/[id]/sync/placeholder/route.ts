import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { Role } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await authorizeClientAction(user.id, id, Role.STAFF);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "Tally";
  const forceFull = searchParams.get("forceFull") === "true";

  const client = await prisma.client.findUnique({ where: { id } });

  if (type === "Tally") {
    if (!client || client.connectorStatus === "OFFLINE") {
      return NextResponse.json({
        success: false,
        message: "Tally Connector Offline. Please ensure your desktop sync bridge is running.",
        errorCode: "CONNECTOR_OFFLINE",
        integration: "TALLY"
      }, { status: 412 });
    }

    // For Tally, we ALWAYS perform a full refresh to prevent stale/ghost vouchers & balances.
    console.log(`[Sync-Placeholder] Tally Client ${id}: Wiping historical vouchers and PNL values to ensure clean sync...`);
    await prisma.normalizedVoucher.deleteMany({
      where: { clientId: id }
    });
    await prisma.pNLValue.deleteMany({
      where: { clientId: id }
    });
    await prisma.financialRecord.deleteMany({
      where: { clientId: id }
    });
    await prisma.normalizedLedger.updateMany({
      where: { clientId: id },
      data: { closingBalance: 0 }
    });

    // Create a background sync task
    const task = await prisma.syncTask.create({
      data: {
        clientId: id,
        type: "TALLY_SYNC",
        status: "PENDING",
        payload: { forceFull }
      }
    });

    return NextResponse.json({
      success: true,
      message: "Sync task initiated successfully. Waiting for desktop connector to process...",
      taskId: task.id,
      status: "PENDING",
      integration: "TALLY"
    });
  }

  return NextResponse.json({
    success: false,
    message: `${type} integration is currently in the setup phase.`,
    errorCode: "INTEGRATION_PENDING",
    integration: type.toUpperCase()
  }, { status: 501 });
}
