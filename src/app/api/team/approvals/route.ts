import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get orgs where the user is SUPER_ADMIN or ORG_ADMIN
  const adminMemberships = await prisma.organizationMembership.findMany({
    where: { 
      userId: user.id, 
      status: "APPROVED",
      role: { in: ["SUPER_ADMIN", "ORG_ADMIN"] } 
    }
  });

  const orgIds = adminMemberships.map(m => m.organizationId);

  const pendingRequests = await prisma.organizationMembership.findMany({
    where: {
      organizationId: { in: orgIds },
      status: "PENDING"
    },
    include: {
      user: { select: { email: true, createdAt: true } },
      organization: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ requests: pendingRequests });
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { membershipId, action } = await req.json();

    if (!membershipId || !["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const targetMembership = await prisma.organizationMembership.findUnique({
      where: { id: membershipId }
    });

    if (!targetMembership) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    const adminCheck = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: targetMembership.organizationId
        }
      }
    });

    if (!adminCheck || adminCheck.status !== "APPROVED" || !["SUPER_ADMIN", "ORG_ADMIN"].includes(adminCheck.role)) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to approve for this organization" }, { status: 403 });
    }

    if (action === "APPROVE") {
      await prisma.organizationMembership.update({
        where: { id: membershipId },
        data: { status: "APPROVED" }
      });
    } else if (action === "REJECT") {
      await prisma.organizationMembership.delete({
        where: { id: membershipId }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Approval Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
