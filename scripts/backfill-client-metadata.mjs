import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeClientName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function main() {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      createdByUserId: true,
      organizationId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;

  for (const client of clients) {
    const data = {};

    if (!client.createdByUserId) {
      const earliestMembership = await prisma.organizationMembership.findFirst({
        where: {
          organizationId: client.organizationId,
          status: "APPROVED",
        },
        orderBy: { createdAt: "asc" },
        select: { userId: true },
      });

      if (earliestMembership?.userId) {
        data.createdByUserId = earliestMembership.userId;
      }
    }

    const normalizedName = normalizeClientName(client.name);
    data.normalizedName = normalizedName;

    if (Object.keys(data).length > 0) {
      await prisma.client.update({
        where: { id: client.id },
        data,
      });
      updated += 1;
    }
  }

  const summary = await prisma.$queryRaw`
    SELECT "normalizedName", COUNT(*)::int AS count
    FROM "Client"
    GROUP BY "normalizedName"
    HAVING COUNT(*) > 1
    ORDER BY count DESC, "normalizedName" ASC
  `;

  console.log(
    JSON.stringify(
      {
        totalClients: clients.length,
        updated,
        duplicateNormalizedNames: summary,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Failed to backfill client metadata", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
