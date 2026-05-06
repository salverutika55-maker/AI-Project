import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verify } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_for_dev_only";

export async function GET(req: Request) {
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

    // Find the oldest pending task for this client
    const task = await prisma.syncTask.findFirst({
      where: { clientId, status: "PENDING" },
      orderBy: { createdAt: "asc" }
    });

    if (!task) {
      return NextResponse.json({ tasks: [] });
    }

    return NextResponse.json({ tasks: [task] });
  } catch (error) {
    console.error("Task Polling Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
