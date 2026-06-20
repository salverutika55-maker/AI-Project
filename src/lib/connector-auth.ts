import { prisma } from "@/lib/prisma";
import { verify } from "jsonwebtoken";

export function getConnectorJwtSecret(): string {
  const secret = process.env.CONNECTOR_JWT_SECRET || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("CONNECTOR_JWT_SECRET or NEXTAUTH_SECRET must be configured");
  }

  return secret;
}

export async function authenticateConnectorRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Authentication required");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const decoded = verify(token, getConnectorJwtSecret(), {
    algorithms: ["HS256"]
  }) as { clientId?: string; deviceId?: string };

  if (!decoded.clientId || !decoded.deviceId) {
    throw new Error("Invalid connector token");
  }

  const device = await prisma.device.findFirst({
    where: {
      clientId: decoded.clientId,
      deviceId: decoded.deviceId,
      status: "ACTIVE"
    },
    select: { id: true, clientId: true, deviceId: true }
  });

  if (!device) {
    throw new Error("Connector device is inactive or revoked");
  }

  return device;
}
