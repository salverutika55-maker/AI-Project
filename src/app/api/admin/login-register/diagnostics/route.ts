import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string } | undefined)?.role !== "ADMIN") {
    return new NextResponse(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
  }

  const now = new Date();
  const missingWindowStart = new Date(now);
  missingWindowStart.setDate(missingWindowStart.getDate() - 9);

  const [
    totalUsers,
    totalLoginRecords,
    loginEventsDuringWindow,
    usersActiveDuringWindow,
    lastLoginEvent,
    lastAuditEvent,
    lastUserActivity,
    legacyTables,
    loginSuccessAuditCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userLoginActivity.count(),
    prisma.userLoginActivity.count({ where: { loginTime: { gte: missingWindowStart } } }),
    prisma.user.count({ where: { lastLogin: { gte: missingWindowStart } } }),
    prisma.userLoginActivity.findFirst({ orderBy: { loginTime: "desc" } }),
    prisma.auditLog.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.user.findFirst({ where: { lastLogin: { not: null } }, orderBy: { lastLogin: "desc" } }),
    prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'audit_logs', 'security_events', 'user_activity_logs', 'sessions')
    `,
    prisma.auditLog.count({ where: { action: "LOGIN_SUCCESS", createdAt: { gte: missingWindowStart } } }),
  ]);

  const missingRecordsEstimate = Math.max(0, usersActiveDuringWindow - loginEventsDuringWindow);

  const causes: string[] = [];
  if (loginEventsDuringWindow === 0 && usersActiveDuringWindow > 0) {
    causes.push("B. Data was never captured for login events during the period.");
  }
  if (loginEventsDuringWindow > 0 && loginSuccessAuditCount === 0) {
    causes.push("A. Data exists in UserLoginActivity but not in AuditLog LOGIN_SUCCESS events.");
  }
  if (totalLoginRecords <= 1 && usersActiveDuringWindow > 0) {
    causes.push("D. A deployment likely introduced login tracking recently, causing historical gap.");
  }
  if (legacyTables.length === 0) {
    causes.push("E. No legacy lower-case auth/log tables found; migration likely uses Prisma model names only.");
  }
  if (causes.length === 0) {
    causes.push("A. Data exists; issue likely in UI filtering/pagination or wrong date filter.");
  }

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      missingPeriod: {
        start: missingWindowStart.toISOString(),
        end: now.toISOString(),
      },
      validation: {
        totalUsers,
        totalLoginRecords,
        missingRecordsEstimate,
        loginEventsDuringMissingPeriod: loginEventsDuringWindow,
        usersActiveDuringMissingPeriod: usersActiveDuringWindow,
        lastSuccessfulLoginEvent: lastLoginEvent?.loginTime?.toISOString() || null,
        lastAuditEvent: lastAuditEvent?.createdAt?.toISOString() || null,
        lastUserActivity: lastUserActivity?.lastLogin?.toISOString() || null,
      },
      legacyTableChecks: {
        found: legacyTables.map((t) => t.table_name),
      },
      rootCauseAssessment: causes,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
