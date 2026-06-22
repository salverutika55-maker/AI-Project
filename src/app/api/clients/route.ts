import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeClientName } from "@/lib/clientIdentity";

function normalizeClientCode(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { name, clientCode, software, sector } = await req.json();
    const trimmedName = String(name || "").trim();
    const normalizedClientCode = normalizeClientCode(clientCode);
    const normalizedName = normalizeClientName(trimmedName);

    if (!trimmedName) {
      return NextResponse.json({ message: "Client Name is required" }, { status: 400 });
    }

    if (!normalizedClientCode) {
      return NextResponse.json({ message: "Client Code is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        memberships: {
          where: { status: "APPROVED" }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    let organizationId = "";

    if (user.memberships && user.memberships.length > 0) {
      organizationId = user.memberships[0].organizationId;
    } else {
      const anyMembership = await prisma.organizationMembership.findFirst({
        where: { userId: user.id }
      });
      if (anyMembership) {
        organizationId = anyMembership.organizationId;
      }
    }

    if (!organizationId) {
      const orgName = `${user.email.split('@')[0]}'s Organization`;
      const org = await prisma.organization.create({
        data: {
          name: orgName,
          members: {
            create: {
              userId: user.id,
              role: 'SUPER_ADMIN',
              status: 'APPROVED'
            }
          }
        }
      });
      organizationId = org.id;
    }

    const existingCode = await prisma.client.findFirst({
      where: {
        organizationId,
        clientCode: normalizedClientCode,
      },
      select: { id: true, name: true, clientCode: true },
    });

    if (existingCode) {
      return NextResponse.json(
        {
          message: "Client Code already exists in this organization",
          existingClient: existingCode,
        },
        { status: 409 }
      );
    }

    const newClient = await prisma.client.create({
      data: {
        name: trimmedName,
        clientCode: normalizedClientCode,
        normalizedName,
        createdByUserId: user.id,
        software: software || "TALLY",
        sector: sector || "TRADING",
        organizationId: organizationId,
      },
    });

    return NextResponse.json({ message: "Client created", client: newClient }, { status: 201 });

  } catch (error) {
    console.error("Client Creation Error:", error);
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { clientId, fiscalYearStartMonth, baseCurrency, sector, clientCode } = await req.json();

    if (!clientId) {
      return NextResponse.json({ message: "Missing clientId" }, { status: 400 });
    }

    // Verify ownership
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        memberships: {
          where: { status: "APPROVED" }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ message: "Unauthorized client access" }, { status: 403 });
    }

    const orgIds = user.memberships.map(m => m.organizationId);

    const client = await prisma.client.findFirst({
      where: user.role === "ADMIN"
        ? { id: clientId }
        : {
            id: clientId,
            organizationId: { in: orgIds }
          }
    });

    if (!client) {
      return NextResponse.json({ message: "Unauthorized client access" }, { status: 403 });
    }

    const updateData: any = {};
    if (fiscalYearStartMonth) updateData.fiscalYearStartMonth = parseInt(fiscalYearStartMonth);
    if (baseCurrency) updateData.baseCurrency = baseCurrency;
    if (sector) updateData.sector = sector;

    if (typeof clientCode === "string") {
      const normalizedClientCode = normalizeClientCode(clientCode);
      if (!normalizedClientCode) {
        return NextResponse.json({ message: "Client Code cannot be empty" }, { status: 400 });
      }

      const conflicting = await prisma.client.findFirst({
        where: {
          organizationId: client.organizationId,
          clientCode: normalizedClientCode,
          id: { not: client.id },
        },
        select: { id: true },
      });

      if (conflicting) {
        return NextResponse.json({ message: "Client Code already exists in this organization" }, { status: 409 });
      }

      updateData.clientCode = normalizedClientCode;
    }

    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: updateData
    });

    return NextResponse.json({ message: "Settings updated", client: updatedClient }, { status: 200 });

  } catch (error) {
    console.error("Client Update Error:", error);
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ message: "Missing clientId" }, { status: 400 });
    }

    // Verify ownership
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        memberships: {
          where: { status: "APPROVED" }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ message: "Unauthorized client access" }, { status: 403 });
    }

    const orgIds = user.memberships.map(m => m.organizationId);

    const client = await prisma.client.findFirst({
      where: user.role === "ADMIN"
        ? { id: clientId }
        : {
            id: clientId,
            organizationId: { in: orgIds }
          }
    });

    if (!client) {
      return NextResponse.json({ message: "Unauthorized client access" }, { status: 403 });
    }

    // Perform Cascade Delete
    await prisma.client.delete({
      where: { id: clientId }
    });

    return NextResponse.json({ message: "Client deleted successfully" }, { status: 200 });

  } catch (error) {
    console.error("Client Deletion Error:", error);
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}
