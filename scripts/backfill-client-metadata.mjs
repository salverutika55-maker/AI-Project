import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeClientName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function slugCode(source) {
  const cleaned = String(source || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "CLIENT";
}

async function main() {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      clientCode: true,
      createdByUserId: true,
      organizationId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  const assignedCodeByGroup = new Map();
  const usedCodesByOrg = new Map();

  for (const client of clients) {
    const org = client.organizationId;
    if (!usedCodesByOrg.has(org)) usedCodesByOrg.set(org, new Set());
    if (client.clientCode) usedCodesByOrg.get(org).add(client.clientCode);
  }

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

    if (!client.clientCode) {
      const groupKey = `${client.organizationId}::${normalizedName}`;

      if (assignedCodeByGroup.has(groupKey)) {
        data.clientCode = assignedCodeByGroup.get(groupKey);
      } else {
        const used = usedCodesByOrg.get(client.organizationId);
        const base = slugCode(client.name).slice(0, 18);
        let candidate = `${base}-001`;
        let index = 1;
        while (used.has(candidate)) {
          index += 1;
          candidate = `${base}-${String(index).padStart(3, "0")}`;
        }
        used.add(candidate);
        assignedCodeByGroup.set(groupKey, candidate);
        data.clientCode = candidate;
      }
    }

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
