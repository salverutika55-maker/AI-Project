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

    // Read access is enough to fetch ledger scrutiny alerts
    await authorizeClientAction(user.id, id, "READ_ONLY");

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const status = searchParams.get("status") || undefined;
    const yearParam = searchParams.get("year");
    const targetYear = yearParam ? parseInt(yearParam) : undefined;

    const alerts = await prisma.scrutinyAlert.findMany({
      where: {
        clientId: id,
        ...(category ? { category } : {}),
        ...(status ? { status } : {})
      },
      include: {
        ledger: {
          select: { name: true, groupName: true }
        },
        voucher: {
          select: { voucherNumber: true, date: true, type: true, narration: true }
        },
        resolvedBy: {
          select: { email: true, role: true }
        }
      },
      orderBy: [
        { severity: "desc" },
        { createdAt: "desc" }
      ]
    });

    let filteredAlerts = alerts;
    if (targetYear) {
      filteredAlerts = alerts.filter(a => {
        if (a.metadata && typeof a.metadata === 'object') {
          const meta = a.metadata as any;
          if ('year' in meta) {
            return Number(meta.year) === targetYear;
          }
        }
        if (a.voucher?.date) {
          const vDate = new Date(a.voucher.date);
          const vYear = vDate.getMonth() >= 3 ? vDate.getFullYear() : vDate.getFullYear() - 1;
          return vYear === targetYear;
        }
        return true;
      });
    }

    return NextResponse.json({ success: true, data: filteredAlerts });
  } catch (error: any) {
    console.error("Scrutiny Alerts Fetch Error:", error);
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

    // Accountant or above required to update alert status
    await authorizeClientAction(user.id, id, "ACCOUNTANT");

    const body = await req.json();
    const { alertId, status, commentary } = body;

    if (!alertId || !status) {
      return NextResponse.json({ error: "Missing required fields: alertId, status" }, { status: 400 });
    }

    const updated = await prisma.scrutinyAlert.update({
      where: { id: alertId },
      data: {
        status,
        commentary,
        resolvedById: user.id
      },
      include: {
        ledger: {
          select: { name: true, groupName: true }
        },
        resolvedBy: {
          select: { email: true, role: true }
        }
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Scrutiny Alert Update Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
