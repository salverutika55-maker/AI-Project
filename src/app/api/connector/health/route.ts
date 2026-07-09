import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const apiKey = authHeader.split("Bearer ")[1].trim();
    
    // Validate DB connectivity and api key in one lightweight query
    const client = await prisma.client.findUnique({
      where: { id: apiKey }
    });

    if (!client) {
      return NextResponse.json({ error: "Invalid API Key" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      client: client.name
    }, { status: 200 });

  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
