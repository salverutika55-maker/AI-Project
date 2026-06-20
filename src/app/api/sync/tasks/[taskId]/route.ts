import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { Role } from "@prisma/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId } = await params;

    const task = await prisma.syncTask.findUnique({
      where: { id: taskId },
      include: {
        client: {
          select: {
            name: true,
            connectorStatus: true
          }
        }
      }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await authorizeClientAction(user.id, task.clientId, Role.READ_ONLY);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: 403 }
      );
    }

    // --- AUTO-TIMEOUT LOGIC ---
    // If task is still PENDING/PROCESSING but is older than 15 minutes, fail it.
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if ((task.status === "PENDING" || task.status === "PROCESSING") && task.createdAt < fifteenMinutesAgo) {
      const failedTask = await prisma.syncTask.update({
        where: { id: taskId },
        data: {
          status: "FAILED",
          error: "Sync timed out (System detected inactivity for > 1 hour)"
        }
      });
      
      // Also reset client status
      await prisma.client.update({
        where: { id: task.clientId },
        data: { connectorStatus: "ONLINE" }
      });

      return NextResponse.json({
        success: true,
        taskId: failedTask.id,
        status: failedTask.status,
        message: failedTask.error,
        updatedAt: failedTask.updatedAt
      });
    }
    // ---------------------------

    return NextResponse.json({
      success: true,
      taskId: task.id,
      status: task.status,
      message: task.status === "COMPLETED" ? "Sync finished!" : 
               task.status === "FAILED" ? task.error : 
               "Sync in progress...",
      result: task.result,
      updatedAt: task.updatedAt
    });
  } catch (error) {
    console.error("Task Status Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
