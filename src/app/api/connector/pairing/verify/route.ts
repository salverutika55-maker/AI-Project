import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sign } from "jsonwebtoken";
import { randomBytes } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_for_dev_only";

export async function POST(req: Request) {
  try {
    const { code, deviceName, deviceId } = await req.json();

    if (!code || !deviceName || !deviceId) {
      return NextResponse.json({ error: "Code, deviceName, and deviceId are required" }, { status: 400 });
    }

    // Find the pairing code
    const pairingCode = await prisma.pairingCode.findUnique({
      where: { code },
      include: { client: true }
    });

    if (!pairingCode || pairingCode.used || pairingCode.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired pairing code" }, { status: 401 });
    }

    // Mark code as used
    await prisma.pairingCode.update({
      where: { id: pairingCode.id },
      data: { used: true }
    });

    // Generate tokens
    const deviceToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(64).toString("hex");
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create or update device registration
    const device = await prisma.device.upsert({
      where: { deviceId },
      update: {
        token: deviceToken,
        refreshToken,
        refreshExpiresAt,
        status: "ACTIVE",
        lastSeen: new Date(),
        name: deviceName
      },
      create: {
        clientId: pairingCode.clientId,
        deviceId,
        name: deviceName,
        token: deviceToken,
        refreshToken,
        refreshExpiresAt,
        status: "ACTIVE"
      }
    });

    // Generate short-lived JWT for immediate use
    const accessToken = sign(
      { deviceId: device.deviceId, clientId: device.clientId },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return NextResponse.json({ 
      success: true, 
      accessToken,
      refreshToken, // Long-lived token for silent renewal
      deviceToken, 
      clientName: pairingCode.client.name 
    });
  } catch (error) {
    console.error("Pairing Verification Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
