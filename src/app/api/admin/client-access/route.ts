import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string } | undefined)?.role !== "ADMIN") {
    return new NextResponse(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId") || undefined;
  const take = Math.min(Number(searchParams.get("take") || "200"), 1000);

  const logs = await prisma.clientAccessLog.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { loggedAt: "desc" },
    take,
    select: {
      id: true,
      clientId: true,
      email: true,
      userId: true,
      ipAddress: true,
      userAgent: true,
      loggedAt: true,
      client: { select: { id: true, name: true } },
    },
  });

  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    {
      logs: logs.map((log) => ({
        ...log,
        loggedAt: log.loggedAt.toISOString(),
      })),
      clients,
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
