import { NextResponse } from "next/server";

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

    // Set to syncing state
    await prisma.client.update({
      where: { id },
      data: { connectorStatus: "SYNCING" }
    });
  }

  return NextResponse.json({
    success: false,
    message: `${type} integration is currently in the setup phase. A local desktop connector or secure tunnel is required for this software.`,
    errorCode: "INTEGRATION_PENDING",
    integration: type.toUpperCase()
  }, { status: 501 });
}
