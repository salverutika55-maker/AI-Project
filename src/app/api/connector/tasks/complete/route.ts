import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verify } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_for_dev_only";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    let clientId: string;
    try {
      const decoded = verify(token, JWT_SECRET) as { clientId: string };
      clientId = decoded.clientId;
    } catch (e) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { taskId, status, result, error } = await req.json();

    if (!taskId || !status) {
      return NextResponse.json({ error: "taskId and status required" }, { status: 400 });
    }

    // Verify task belongs to this client
    const task = await prisma.syncTask.findFirst({
      where: { id: taskId, clientId }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found for this client" }, { status: 404 });
    }

    // Update task
    const updatedTask = await prisma.syncTask.update({
      where: { id: taskId },
      data: {
        status,
        result: result || null,
        error: error || null,
      }
    });

    // If completed, we would normally trigger data ingestion here
    // For now, we just mark it as done.

    return NextResponse.json({ 
      success: true, 
      taskId: updatedTask.id,
      status: updatedTask.status 
    });
  } catch (error) {
    console.error("Task Completion Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
