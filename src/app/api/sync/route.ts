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
    const { source, clientId, startDate, endDate } = body; 

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

    // 2. Authorize Action (Allow Global Admin or Org Admin)
    try {
      if (user.role !== "ADMIN") {
        await authorizeClientAction(user.id, clientId, Role.ORG_ADMIN);
      }
    } catch (error: any) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    // 3. Fetch Client to get lastSyncedAt
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { lastSyncedAt: true, software: true }
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    // 4. Create Sync Task
    const task = await prisma.syncTask.create({
      data: {
        clientId: clientId,
        type: "TALLY_SYNC",
        status: "PENDING",
        payload: {
          source: source || "UI_TRIGGER",
          lastSyncedAt: client.lastSyncedAt,
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });

    return NextResponse.json({ 
      message: "Sync task created successfully",
      taskId: task.id,
      status: task.status,
      lastSyncedAt: client.lastSyncedAt
    }, { status: 201 });

  } catch (error) {
    console.error("Sync Error:", error);
    return NextResponse.json({ message: "Internal Error during Synchronization" }, { status: 500 });
  }
}
