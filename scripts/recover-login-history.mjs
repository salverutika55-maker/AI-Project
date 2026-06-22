import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  return {
    includeLastLoginFallback: argv.includes("--from-last-login"),
  };
}

async function insertFromAuditLog() {
  const loginAudits = await prisma.auditLog.findMany({
    where: { action: "LOGIN_SUCCESS", userId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      user: { select: { email: true, role: true } },
    },
  });

  let inserted = 0;
  let skipped = 0;

  for (const log of loginAudits) {
    if (!log.userId || !log.user?.email) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.userLoginActivity.findFirst({
      where: {
        userId: log.userId,
        loginTime: log.createdAt,
      },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.userLoginActivity.create({
      data: {
        userId: log.userId,
        email: log.user.email,
        userRole: log.user.role,
        loginTime: log.createdAt,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
      },
    });

    inserted += 1;
  }

  return { scanned: loginAudits.length, inserted, skipped };
}

async function insertFromUserLastLogin() {
  const users = await prisma.user.findMany({
    where: { lastLogin: { not: null } },
    select: { id: true, email: true, role: true, lastLogin: true },
    orderBy: { lastLogin: "asc" },
  });

  let inserted = 0;
  let skipped = 0;

  for (const user of users) {
    if (!user.lastLogin) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.userLoginActivity.findFirst({
      where: {
        userId: user.id,
        loginTime: user.lastLogin,
      },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.userLoginActivity.create({
      data: {
        userId: user.id,
        email: user.email,
        userRole: user.role,
        loginTime: user.lastLogin,
        ipAddress: null,
        userAgent: "RECOVERED_FROM_USER_LASTLOGIN",
      },
    });

    inserted += 1;
  }

  return { scanned: users.length, inserted, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const before = await prisma.userLoginActivity.count();
  const auditResult = await insertFromAuditLog();

  let fallbackResult = { scanned: 0, inserted: 0, skipped: 0 };
  if (args.includeLastLoginFallback) {
    fallbackResult = await insertFromUserLastLogin();
  }

  const after = await prisma.userLoginActivity.count();

  console.log(JSON.stringify({
    before,
    after,
    insertedTotal: after - before,
    fromAuditLog: auditResult,
    fromUserLastLogin: fallbackResult,
    includeLastLoginFallback: args.includeLastLoginFallback,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to recover login history", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
