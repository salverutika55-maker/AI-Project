import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { authorizeClientAction } from "@/lib/rbac";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ message: "Client ID Required" }, { status: 400 });
    }

    // 1. Fetch User
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // 2. Authorize Action
    try {
      if (user.role !== "ADMIN") {
        await authorizeClientAction(user.id, clientId, Role.ORG_ADMIN);
      }
    } catch (error: any) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    // 3. Reset all PENDING/PROCESSING tasks for this client to FAILED
    await prisma.syncTask.updateMany({
      where: {
        clientId: clientId,
        status: { in: ["PENDING", "PROCESSING"] }
      },
      data: {
        status: "FAILED",
        error: "Manually reset by user"
      }
    });

    // 4. Reset Client Status
    await prisma.client.update({
      where: { id: clientId },
      data: { connectorStatus: "ONLINE" }
    });

    return NextResponse.json({ 
      success: true,
      message: "Sync status reset successfully. You can now try syncing again."
    });

  } catch (error) {
    console.error("Reset Sync Error:", error);
    return NextResponse.json({ message: "Internal Error during Reset" }, { status: 500 });
  }
}
