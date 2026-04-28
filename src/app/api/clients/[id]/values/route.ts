import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2026");

  try {
    const values = await prisma.pNLValue.findMany({
      where: { 
        clientId: id,
        year: year
      }
    });

    return NextResponse.json({ values });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
