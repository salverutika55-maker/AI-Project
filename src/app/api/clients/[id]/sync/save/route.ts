import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { results, month, year } = await req.json();

  // 1. Secure Session Check
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
  }

  try {
    // 2. Authorization & Ownership Check
    const client = await prisma.client.findUnique({
      where: { id }
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (user?.role !== "ADMIN" && client.userId !== user?.id) {
      return NextResponse.json({ error: "Access Denied. You do not own this client." }, { status: 403 });
    }
    // Save a batch of P&L values
    await Promise.all(Object.entries(results).map(([head, amount]) => 
      prisma.pNLValue.upsert({
        where: {
          clientId_headName_month_year: {
            clientId: id,
            headName: head,
            month,
            year
          }
        },
        update: { amount: amount as number },
        create: {
          clientId: id,
          headName: head,
          month,
          year,
          amount: amount as number
        }
      })
    ));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
