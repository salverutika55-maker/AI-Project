import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { decrypt, encrypt } from "@/lib/encryption";

// Helper to get Zoho Access Token (Secured and Encrypted)
async function getZohoAccessToken(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || !client.oauthToken) throw new Error("No Zoho account linked.");

  const decryptedTokenString = decrypt(client.oauthToken);
  const tokens = JSON.parse(decryptedTokenString);
  
  const accountsUrl = tokens.accounts_url || "https://accounts.zoho.in";
  const tokenUrl = `${accountsUrl}/oauth/v2/token`;
  
  const config = OAUTH_CONFIGS[client.software];

  try {
    const refreshResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    const newTokens = await refreshResponse.json();
    if (newTokens.access_token) {
      const updatedTokens = { ...tokens, ...newTokens };
      const newlyEncrypted = encrypt(JSON.stringify(updatedTokens));
      await prisma.client.update({
        where: { id: clientId },
        data: { oauthToken: newlyEncrypted },
      });
      return { token: newTokens.access_token, tokens: updatedTokens };
    }
    
    if (newTokens.error === "invalid_token" || newTokens.error === "invalid_grant") {
      throw new Error("Zoho session expired. Please re-link your account in the Client Hub.");
    }
    
    return { token: tokens.access_token, tokens };
  } catch (e: any) {
    throw new Error(`Token Refresh Failed: ${e.message}`);
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Secure Session Check
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Authorization & Ownership Check
    const client = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });

    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (user?.role !== "ADMIN" && client.userId !== user?.id) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    let chartOfAccounts: any[] = [];
    let error: string | null = null;
    let debug: any = {};

    if (client.software === "ZOHO") {
      if (!client.oauthToken) {
        error = "Zoho account not linked.";
      } else {
        try {
          const { token: accessToken, tokens } = await getZohoAccessToken(id);
          
          const baseDomains = ["https://books.zoho.in", "https://books.zoho.com", "https://books.zoho.eu"];

          if (tokens.api_domain) {
            const domainUrl = new URL(tokens.api_domain);
            let host = domainUrl.hostname;
            if (!host.startsWith("books.")) host = host.replace(/^www\.|^api\.|^/, "books.");
            baseDomains.unshift(`https://${host}`);
          }
          
          const domains = [...new Set(baseDomains)];
          let coaData: any = null;
          let lastError = "";
          
          for (const domain of domains) {
            try {
              const orgsRes = await fetch(`${domain}/api/v3/organizations`, {
                headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
                signal: AbortSignal.timeout(5000)
              });
              if (!orgsRes.ok) continue;
              const orgsData = await orgsRes.json();
              const orgId = orgsData.organizations?.[0]?.organization_id;
              if (orgId) {
                const coaRes = await fetch(`${domain}/api/v3/chartofaccounts?organization_id=${orgId}`, {
                  headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
                });
                coaData = await coaRes.json();
                if (coaData.chartofaccounts) break;
              }
            } catch (err: any) { continue; }
          }

          if (coaData?.chartofaccounts) chartOfAccounts = coaData.chartofaccounts;
          else error = "Failed to connect to Zoho Books.";
        } catch (e: any) { error = e.message; }
      }
    }

    return NextResponse.json({
      error,
      mappings: client.pnlMappings,
      chartOfAccounts: chartOfAccounts.map(a => ({
        name: a.account_name,
        type: a.account_type,
        id: a.account_id
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { mappings } = await req.json();

  // 1. Secure Session Check
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (user?.role !== "ADMIN" && client.userId !== user?.id) return NextResponse.json({ error: "Access Denied" }, { status: 403 });

    await prisma.pnlMapping.deleteMany({ where: { clientId: id } });
    await prisma.pnlMapping.createMany({
      data: mappings.map((m: any) => ({
        clientId: id,
        sectorHead: m.sectorHead,
        softwareLedgerName: m.softwareLedgerName
      }))
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
