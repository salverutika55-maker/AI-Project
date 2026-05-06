import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomInt } from "crypto";

export async function POST(req: Request) {
  try {
    const { clientId } = await req.json();

    if (!clientId) {
      return NextResponse.json({ error: "Client ID required" }, { status: 400 });
    }

    // Generate a secure 6-digit code
    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

    // Delete any existing unused codes for this client
    await prisma.pairingCode.deleteMany({
      where: { clientId, used: false }
    });

    const pairingCode = await prisma.pairingCode.create({
      data: {
        clientId,
        code,
        expiresAt
      }
    });

    return NextResponse.json({ 
      success: true, 
      code: pairingCode.code,
      expiresAt: pairingCode.expiresAt 
    });
  } catch (error) {
    console.error("Pairing Code Generation Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
