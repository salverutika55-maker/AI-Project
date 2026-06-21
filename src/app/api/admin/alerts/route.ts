import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== "ADMIN") {
    return new NextResponse(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
  }

  const recentAlerts = await prisma.securityAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ recentAlerts, fetchedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
