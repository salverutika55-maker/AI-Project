import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { GSTConnectionService } from "@/lib/gst/services/GSTConnectionService";

export async function GET(
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

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const status = await GSTConnectionService.getConnectionStatus(id);
    return NextResponse.json(status);
  } catch (err: any) {
    console.error("Error fetching GST connection status:", err);
    return NextResponse.json({ error: err?.message || "Failed to fetch GST connection" }, { status: 500 });
  }
}

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

    await authorizeClientAction(user.id, id, "FINANCE_MANAGER");

    const body = await req.json();
    const { gstin, username, otpToken } = body;

    if (!gstin) {
      return NextResponse.json({ error: "GSTIN is required." }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const result = await GSTConnectionService.connect(
      id,
      gstin,
      { username, otpToken },
      user.id,
      ip
    );

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Error connecting GSTIN:", err);
    return NextResponse.json({ error: err?.message || "Failed to connect GSTIN" }, { status: 400 });
  }
}

export async function DELETE(
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

    await authorizeClientAction(user.id, id, "FINANCE_MANAGER");

    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const result = await GSTConnectionService.disconnect(id, user.id, ip);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Error disconnecting GSTIN:", err);
    return NextResponse.json({ error: err?.message || "Failed to disconnect GSTIN" }, { status: 500 });
  }
}
