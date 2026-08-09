import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isGlobalAdmin = user.role === "ADMIN";
  let orgIds: string[] = [];

  if (isGlobalAdmin) {
    const allOrgs = await prisma.organization.findMany({ select: { id: true } });
    orgIds = allOrgs.map(o => o.id);
  } else {
    // Get orgs where the user is SUPER_ADMIN or ORG_ADMIN
    const adminMemberships = await prisma.organizationMembership.findMany({
      where: { 
        userId: user.id, 
        status: "APPROVED",
        role: { in: ["SUPER_ADMIN", "ORG_ADMIN"] } 
      }
    });
    orgIds = adminMemberships.map(m => m.organizationId);
  }

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

  // Filter out requests that the current admin has already rejected
  const filteredRequests = pendingRequests.filter(request => {
    if (!request.rejectedByUserIds) return true;
    const rejections = request.rejectedByUserIds.split(",").filter(Boolean);
    return !rejections.includes(user.id);
  });

  return NextResponse.json({ requests: filteredRequests });
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

    const result = await prisma.$transaction(async (tx) => {
      const targetMembership = await tx.organizationMembership.findUnique({
        where: { id: membershipId }
      });

      if (!targetMembership) {
        return { error: "Request not found", status: 404 };
      }

      // Check if already approved/rejected in a concurrent call
      if (targetMembership.status === "APPROVED") {
        return { success: true, message: "Request already approved" };
      }
      if (targetMembership.status === "REJECTED") {
        return { success: true, message: "Request already rejected" };
      }

      // Enforce self-approval restriction
      if (targetMembership.userId === user.id) {
        return { error: "Forbidden: You cannot approve your own request", status: 403 };
      }

      const isGlobalAdmin = user.role === "ADMIN";

      if (!isGlobalAdmin) {
        const adminCheck = await tx.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: targetMembership.organizationId
            }
          }
        });

        if (!adminCheck || adminCheck.status !== "APPROVED" || !["SUPER_ADMIN", "ORG_ADMIN"].includes(adminCheck.role)) {
          return { error: "Forbidden: You do not have permission to review requests for this organization", status: 403 };
        }
      }

      if (action === "APPROVE") {
        await tx.organizationMembership.update({
          where: { id: membershipId },
          data: { 
            status: "APPROVED",
            approvedAt: new Date(),
            approvedByUserId: user.id,
            rejectedAt: null,
            rejectionReason: null,
            rejectedByUserIds: null,
            notificationStatus: "RESOLVED"
          }
        });
        return { success: true };
      } else {
        // action === "REJECT"
        const currentRejections = targetMembership.rejectedByUserIds 
          ? targetMembership.rejectedByUserIds.split(",").filter(Boolean)
          : [];

        if (!currentRejections.includes(user.id)) {
          currentRejections.push(user.id);
        }

        // Get all authorized administrators for this organization
        const orgAdmins = await tx.organizationMembership.findMany({
          where: {
            organizationId: targetMembership.organizationId,
            role: { in: ["SUPER_ADMIN", "ORG_ADMIN"] },
            status: "APPROVED"
          }
        });
        const orgAdminUserIds = orgAdmins.map(a => a.userId);

        const globalAdmins = await tx.user.findMany({
          where: { role: "ADMIN" }
        });
        const globalAdminUserIds = globalAdmins.map(g => g.id);

        const allAdminIds = Array.from(new Set([...orgAdminUserIds, ...globalAdminUserIds]));

        const hasAllRejected = allAdminIds.length > 0 && allAdminIds.every(id => currentRejections.includes(id));

        if (hasAllRejected) {
          await tx.organizationMembership.update({
            where: { id: membershipId },
            data: {
              status: "REJECTED",
              rejectedAt: new Date(),
              rejectionReason: "Rejected by all administrators",
              rejectedByUserIds: currentRejections.join(","),
              notificationStatus: "RESOLVED"
            }
          });
        } else {
          await tx.organizationMembership.update({
            where: { id: membershipId },
            data: {
              rejectedByUserIds: currentRejections.join(",")
            }
          });
        }

        return { success: true };
      }
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error("Approval Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
