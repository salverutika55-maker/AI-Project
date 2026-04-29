import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { encrypt } from "@/lib/encryption";
import { logSecurityEvent } from "@/lib/logger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { results, month, year } = await req.json();

  // 1. Secure Session Check
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 2. Authorization & Ownership Check
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    if (user.role !== "ADMIN" && client.userId !== user.id) {
      await logSecurityEvent(user.id, "UNAUTHORIZED_SAVE_ATTEMPT", id, `Attempted to save to client ${id}`, req);
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    // 3. Save a batch of P&L values with ENCRYPTION
    await Promise.all(Object.entries(results).map(([head, amount]) => {
      // ENCRYPT the amount before saving
      const encryptedAmount = encrypt(String(amount));
      
      return prisma.pNLValue.upsert({
        where: {
          clientId_headName_month_year: {
            clientId: id,
            headName: head,
            month,
            year
          }
        },
        update: { amount: encryptedAmount },
        create: {
          clientId: id,
          headName: head,
          month,
          year,
          amount: encryptedAmount
        }
      });
    }));

    await logSecurityEvent(user.id, "SYNC_SAVE_SUCCESS", id, `Successfully saved P&L for ${month} ${year}`, req);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Save Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
