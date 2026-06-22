import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== "ADMIN") {
    return new NextResponse(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
  }

  const totalUsers = await prisma.user.count();
  const loginWindowStart = new Date(Date.now() - 5 * 60 * 1000);
  const usersLoggedInTodayWindow = new Date();
  usersLoggedInTodayWindow.setHours(0, 0, 0, 0);

  const recentLogins = await prisma.userLoginActivity.findMany({
    orderBy: { loginTime: "desc" },
    take: 20,
  });

  const activeUsersNow = await prisma.userLoginActivity.findMany({
    where: {
      loginTime: {
        gte: loginWindowStart,
      },
    },
    distinct: ["userId"],
    select: { userId: true },
  });

  const usersLoggedInToday = await prisma.userLoginActivity.findMany({
    where: {
      loginTime: {
        gte: usersLoggedInTodayWindow,
      },
    },
    distinct: ["userId"],
    select: { userId: true },
  });

  const lastLoginEvent = recentLogins.length > 0 ? recentLogins[0].loginTime.toISOString() : null;

  return NextResponse.json({
    totalUsers,
    activeUsersNow: activeUsersNow.length,
    usersLoggedInToday: usersLoggedInToday.length,
    recentLogins,
    lastLoginEvent,
    lastDatabaseUpdate: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
