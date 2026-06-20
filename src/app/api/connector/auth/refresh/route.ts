import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sign } from "jsonwebtoken";
import { randomBytes } from "crypto";
import { getConnectorJwtSecret } from "@/lib/connector-auth";


export async function POST(req: Request) {
  try {
    const { refreshToken, deviceId } = await req.json();

    if (!refreshToken || !deviceId) {
      return NextResponse.json({ error: "refreshToken and deviceId are required" }, { status: 400 });
    }

    // Find the device and validate the refresh token
    const device = await prisma.device.findFirst({
      where: { 
        deviceId,
        refreshToken,
        status: "ACTIVE"
      }
    });

    if (!device || (device.refreshExpiresAt && device.refreshExpiresAt < new Date())) {
      return NextResponse.json({ 
        error: "Invalid or expired session. Please re-pair your device.",
        errorCode: "SESSION_EXPIRED" 
      }, { status: 401 });
    }

    // ROTATION: Generate a NEW refresh token
    const newRefreshToken = randomBytes(64).toString("hex");
    const newRefreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Reset 30 days

    // Update device with new refresh token
    await prisma.device.update({
      where: { id: device.id },
      data: {
        refreshToken: newRefreshToken,
        refreshExpiresAt: newRefreshExpiresAt,
        lastSeen: new Date()
      }
    });

    // Generate a new short-lived session JWT
    const accessToken = sign(
      { deviceId: device.deviceId, clientId: device.clientId },
      getConnectorJwtSecret(),
      { expiresIn: "1h" }
    );

    return NextResponse.json({ 
      success: true, 
      accessToken,
      refreshToken: newRefreshToken // Return the rotated refresh token
    });
  } catch (error) {
    console.error("Token Refresh Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
