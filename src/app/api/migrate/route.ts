import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

export async function GET() {
  try {
    console.log("Starting Enterprise RBAC Data Migration...");

    // 1. Migrate Users to Organizations
    const users = await prisma.user.findMany();
    for (const user of users) {
      // Check if user already has memberships
      const existing = await prisma.organizationMembership.findFirst({ where: { userId: user.id } });
      if (!existing) {
        console.log(`Migrating User: ${user.email}`);
        const orgName = `${user.email.split('@')[0]}'s Organization`;
        
        const org = await prisma.organization.create({
          data: {
            name: orgName,
            members: {
              create: {
                userId: user.id,
                role: 'SUPER_ADMIN'
            }
            }
          }
        });
        console.log(` -> Created Organization: ${org.id}`);

        // 2. Migrate Clients for this user
        const clients = await prisma.client.findMany({ where: { userId: user.id } });
        for (const client of clients) {
          console.log(`   -> Migrating Client: ${client.name} (${client.software})`);
          
          // Link client to org
          await prisma.client.update({
            where: { id: client.id },
            data: { organizationId: org.id }
          });

          // 3. Migrate Credentials to Vault
          const hasCreds = await prisma.integrationCredential.findUnique({ where: { clientId: client.id } });
          if (!hasCreds) {
            const encryptedOauth = client.oauthToken ? encrypt(client.oauthToken) : null;
            const encryptedApi = client.apiKey ? encrypt(client.apiKey) : null;
            
            await prisma.integrationCredential.create({
              data: {
                clientId: client.id,
                encryptedOauthToken: encryptedOauth,
                encryptedApiKey: encryptedApi,
              }
            });
            console.log(`     -> Vaulted credentials securely.`);
          }
        }
      }
    }

    return NextResponse.json({ message: "Migration Complete! Data is now in the Secure Credential Vault." });
  } catch (error: any) {
    console.error("Migration Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
