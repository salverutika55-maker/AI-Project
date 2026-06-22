import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verify } from "jsonwebtoken";
import { getConnectorJwtSecret } from "@/lib/connector-auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, status } = body;
    
    // Check for Bearer Token in headers
    const authHeader = req.headers.get("authorization");
    let clientId: string | null = null;
    let deviceId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = verify(token, getConnectorJwtSecret(), {
          algorithms: ["HS256"]
        }) as { clientId: string, deviceId: string };
        clientId = decoded.clientId;
        deviceId = decoded.deviceId;
      } catch (e) {
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
      }
    }

    let client;

    if (clientId && deviceId) {
      // Secure Token Heartbeat
      client = await prisma.client.update({
        where: { id: clientId },
        data: {
          connectorStatus: status || "ONLINE",
          lastHeartbeat: new Date(),
          devices: {
            update: {
              where: { deviceId },
              data: { lastSeen: new Date(), status: "ACTIVE" }
            }
          }
        }
      });
    } else if (apiKey) {
      // Legacy API Key Heartbeat
      const existingClient = await prisma.client.findFirst({
        where: { id: apiKey }
      });
      if (!existingClient) {
        return NextResponse.json({ error: "Client not found for this API key" }, { status: 404 });
      }
      client = await prisma.client.update({
        where: { id: existingClient.id },
        data: {
          connectorStatus: status || "ONLINE",
          lastHeartbeat: new Date(),
        },
      });
    } else {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const pendingTask = client ? await prisma.syncTask.findFirst({
      where: { clientId: client.id, status: "PENDING" }
    }) : null;

    return NextResponse.json({ 
      success: true, 
      client: client?.name,
      status: client?.connectorStatus,
      authType: clientId ? "SECURE_TOKEN" : "API_KEY",
      pendingSync: !!pendingTask
    });
  } catch (error) {
    console.error("Heartbeat Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
