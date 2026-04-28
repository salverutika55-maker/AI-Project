import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { results, month, year } = await req.json();

  try {
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
