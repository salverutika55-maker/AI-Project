import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { GSTSyncService } from "@/lib/gst/services/GSTSyncService";

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

    const history = await GSTSyncService.getSyncHistory(id, 10);
    return NextResponse.json({ syncHistory: history });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch sync history" }, { status: 500 });
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
    const { period, dataType = "ALL", financialYear } = body;

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: "Explicit return period in YYYY-MM format is required (e.g. 2026-03)." }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const result = await GSTSyncService.sync(
      id,
      { period, dataType, financialYear },
      user.id,
      ip
    );

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Error running GST sync:", err);
    return NextResponse.json({ error: err?.message || "GST synchronization failed" }, { status: 400 });
  }
}
