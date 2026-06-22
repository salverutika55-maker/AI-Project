require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main(){
  const targets = await prisma.client.findMany({
    where: { name: { in: ['SSA TAX CONSULTANT', 'SSA Tax Consultant'] } },
    select: { id: true, name: true, organizationId: true, createdAt: true, sector: true },
    orderBy: { createdAt: 'asc' }
  });

  const output = [];

  for (const client of targets) {
    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId: client.organizationId },
      include: { user: { select: { id: true, email: true, role: true } }, organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' }
    });

    const auditByEntity = await prisma.auditLog.findMany({
      where: { entityId: client.id },
      select: { id: true, userId: true, action: true, details: true, createdAt: true, user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' }
    });

    const auditByName = await prisma.$queryRawUnsafe(
      `SELECT a.id, a."userId", a.action, a.details, a."createdAt", u.email
       FROM "AuditLog" a
       LEFT JOIN "User" u ON u.id = a."userId"
       WHERE a.details ILIKE '%' || $1 || '%'
       ORDER BY a."createdAt" ASC
       LIMIT 50`,
      client.name
    );

    output.push({
      client,
      organization: memberships[0]?.organization || null,
      memberships: memberships.map(m => ({
        userId: m.userId,
        email: m.user.email,
        platformRole: m.user.role,
        orgRole: m.role,
        membershipStatus: m.status,
        membershipCreatedAt: m.createdAt,
      })),
      possibleCreatorByEarliestMembership: memberships[0]
        ? { email: memberships[0].user.email, createdAt: memberships[0].createdAt }
        : null,
      auditByEntity,
      auditByName,
    });
  }

  console.log(JSON.stringify({ count: targets.length, results: output }, null, 2));
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async()=>{ await prisma.$disconnect(); });
