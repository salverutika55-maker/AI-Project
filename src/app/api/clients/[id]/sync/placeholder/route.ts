import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "Tally";

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

    // Create a background sync task
    const task = await prisma.syncTask.create({
      data: {
        clientId: id,
        type: "TALLY_SYNC",
        status: "PENDING"
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
