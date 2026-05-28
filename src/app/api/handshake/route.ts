import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Generate a random 6-character alphanumeric code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result.slice(0, 3) + '-' + result.slice(3);
}

// POST: Dashboard requesting a new connection code
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = await req.json();

    if (!clientId) {
      return NextResponse.json({ message: "Missing clientId" }, { status: 400 });
    }

    // Verify ownership or ADMIN role
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { status: "APPROVED" } } }
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    const orgIds = user.memberships.map(m => m.organizationId);
    const hasAccess = user.role === "ADMIN" || orgIds.includes(client.organizationId);

    if (!hasAccess) {
      return NextResponse.json({ message: "Unauthorized access to client" }, { status: 403 });
    }

    // Generate new code valid for 15 minutes
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const handshake = await prisma.handshakeCode.create({
      data: {
        code,
        clientId,
        expiresAt,
      }
    });

    return NextResponse.json({ message: "Code generated", code: handshake.code, expiresAt: handshake.expiresAt }, { status: 201 });

  } catch (error) {
    console.error("Handshake Generation Error:", error);
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}

// PUT: Desktop Agent trading the code for an API Key
export async function PUT(req: Request) {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ message: "Missing connection code" }, { status: 400 });
    }

    const handshake = await prisma.handshakeCode.findUnique({
      where: { code },
      include: { client: true }
    });

    if (!handshake) {
      return NextResponse.json({ message: "Invalid connection code" }, { status: 404 });
    }

    if (new Date() > handshake.expiresAt) {
      // Delete expired code
      await prisma.handshakeCode.delete({ where: { id: handshake.id } });
      return NextResponse.json({ message: "Connection code has expired" }, { status: 410 });
    }

    // Success! Return the API Key
    const apiKey = handshake.client.id;

    // Delete the code so it cannot be used again
    await prisma.handshakeCode.delete({ where: { id: handshake.id } });

    return NextResponse.json({ 
      message: "Connected successfully", 
      apiKey,
      clientName: handshake.client.name,
      baseCurrency: handshake.client.baseCurrency
    }, { status: 200 });

  } catch (error) {
    console.error("Handshake Exchange Error:", error);
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}
