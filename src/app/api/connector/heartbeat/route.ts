import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { apiKey, status } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: "API Key required" }, { status: 401 });
    }

    const client = await prisma.client.update({
      where: { apiKey },
      data: {
        connectorStatus: status || "ONLINE",
        lastHeartbeat: new Date(),
      },
    });

    return NextResponse.json({ 
      success: true, 
      client: client.name,
      status: client.connectorStatus 
    });
  } catch (error) {
    console.error("Heartbeat Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
