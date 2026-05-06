import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "Tally";

  return NextResponse.json({
    success: false,
    message: `${type} integration is currently in the setup phase. A local desktop connector or secure tunnel is required for this software.`,
    errorCode: "INTEGRATION_PENDING",
    integration: type.toUpperCase()
  }, { status: 501 });
}
