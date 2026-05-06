import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
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
