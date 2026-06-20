import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const { clientId } = await req.json();

    if (!clientId) {
      return NextResponse.json({ error: "Client ID required" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await authorizeClientAction(user.id, clientId, Role.FINANCE_MANAGER);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: 403 }
      );
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
