import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";

export const dynamic = "force-dynamic";

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

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const status = searchParams.get("status") || undefined;

    const alerts = await prisma.complianceAlert.findMany({
      where: {
        clientId: id,
        ...(category ? { category } : {}),
        ...(status ? { status } : {})
      },
      include: {
        resolvedBy: {
          select: { email: true, role: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ success: true, data: alerts });
  } catch (error: any) {
    console.error("Compliance Alerts Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    // Enforce Auditor/Manager access for resolutions
    await authorizeClientAction(user.id, id, "ACCOUNTANT");

    const body = await req.json();
    const { alertId, status, commentary } = body;

    const updated = await prisma.complianceAlert.update({
      where: { id: alertId },
      data: {
        status,
        commentary,
        resolvedById: user.id
      },
      include: {
        resolvedBy: {
          select: { email: true, role: true }
        }
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Compliance Alert Update Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
