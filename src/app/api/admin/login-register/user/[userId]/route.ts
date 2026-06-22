import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    userId: string;
  }>;
};

export async function GET(_request: Request, context: Params) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string } | undefined)?.role !== "ADMIN") {
    return new NextResponse(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
  }

  const { userId } = await context.params;

  const [user, aggregate] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    }),
    prisma.userLoginActivity.aggregate({
      where: { userId },
      _count: { _all: true },
      _min: { loginTime: true },
      _max: { loginTime: true },
    }),
  ]);

  if (!user) {
    return new NextResponse(JSON.stringify({ message: "User not found" }), { status: 404 });
  }

  const totalLogins = aggregate._count._all;
  const firstLogin = aggregate._min.loginTime;
  const lastLogin = aggregate._max.loginTime;

  const daysSinceFirst = firstLogin
    ? Math.max(1, Math.ceil((Date.now() - firstLogin.getTime()) / (1000 * 60 * 60 * 24)))
    : 1;

  const averageDailyLogins = totalLogins > 0 ? Number((totalLogins / daysSinceFirst).toFixed(2)) : 0;
  const currentStatus = lastLogin && Date.now() - lastLogin.getTime() <= 15 * 60 * 1000 ? "Online" : "Offline";

  return NextResponse.json(
    {
      user,
      stats: {
        totalLogins,
        firstLogin: firstLogin ? firstLogin.toISOString() : null,
        lastLogin: lastLogin ? lastLogin.toISOString() : null,
        averageDailyLogins,
        currentStatus,
      },
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
