import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw`
    WITH audit_first AS (
      SELECT DISTINCT ON (a."userId", DATE(a."createdAt"))
        a."userId",
        DATE(a."createdAt") AS activity_day,
        a."createdAt" AS first_activity_at,
        a."ipAddress",
        a."userAgent"
      FROM "AuditLog" a
      WHERE a."userId" IS NOT NULL
        AND a.action NOT IN ('LOGIN_FAILED', 'AUDIT_LOG_WRITE_FAILURE')
      ORDER BY a."userId", DATE(a."createdAt"), a."createdAt" ASC
    )
    SELECT
      af."userId",
      af.activity_day,
      af.first_activity_at,
      af."ipAddress",
      af."userAgent",
      u.email,
      u.role
    FROM audit_first af
    JOIN "User" u ON u.id = af."userId"
    ORDER BY af.first_activity_at ASC
  `;

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const existingByDay = await prisma.$queryRaw`
      SELECT id
      FROM "UserLoginActivity"
      WHERE "userId" = ${row.userId}
        AND DATE("loginTime") = ${row.activity_day}
      LIMIT 1
    `;

    if (existingByDay.length > 0) {
      skipped += 1;
      continue;
    }

    await prisma.userLoginActivity.create({
      data: {
        userId: row.userId,
        email: row.email,
        userRole: row.role,
        loginTime: row.first_activity_at,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent || "RECOVERED_FROM_AUDIT_ACTIVITY",
      },
    });

    inserted += 1;
  }

  const total = await prisma.userLoginActivity.count();

  console.log(
    JSON.stringify(
      {
        candidateAuditDays: rows.length,
        inserted,
        skipped,
        totalLoginHistoryAfterRecovery: total,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Failed to recover from audit activity", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
