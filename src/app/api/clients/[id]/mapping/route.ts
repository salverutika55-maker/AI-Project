import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { decrypt, encrypt } from "@/lib/encryption";

import { authorizeClientAction } from "@/lib/rbac";

// Helper to get Zoho Access Token (Secured and Encrypted)
async function getZohoAccessToken(clientId: string) {
  const client = await prisma.client.findUnique({ 
    where: { id: clientId },
    include: { credentials: true }
  });
  if (!client || !client.credentials?.encryptedOauthToken) throw new Error("No Zoho account linked.");

  const decryptedTokenString = decrypt(client.credentials.encryptedOauthToken);
  if (!decryptedTokenString || decryptedTokenString === "undefined") {
    throw new Error("Zoho credentials corrupted. Please re-link account.");
  }
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
      await prisma.integrationCredential.update({
        where: { clientId },
        data: { encryptedOauthToken: newlyEncrypted },
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
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "ACCOUNTANT");

    const client = await prisma.client.findUnique({
      where: { id },
      include: { 
        pnlMappings: true,
        credentials: true
      }
    });

    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    let chartOfAccounts: any[] = [];
    let error: string | null = null;
    let debug: any = {};

    if (client.software === "ZOHO") {
      if (!client.credentials?.encryptedOauthToken) {
        error = "Zoho account not linked.";
      } else {
        try {
          const { token: accessToken, tokens } = await getZohoAccessToken(id);
          
          const domains = tokens.api_domain ? [tokens.api_domain] : [
            "https://www.zohoapis.in/books/v3",
            "https://www.zohoapis.com/books/v3",
            "https://www.zohoapis.eu/books/v3",
            "https://www.zohoapis.com.au/books/v3"
          ];
          
          let coaData: any = null;
          
          for (const domain of domains) {
            try {
              const apiBase = domain.includes("/books/v3") ? domain : `${domain.replace(/\/$/, "")}/books/v3`;
              
              const orgsRes = await fetch(`${apiBase}/organizations`, {
                headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
                signal: AbortSignal.timeout(5000)
              });
              
              if (!orgsRes.ok) continue;
              const orgsData = await orgsRes.json();
              const organizations = orgsData.organizations || [];
              
              // Match organization by name (same as sync)
              let org = organizations.find((o: any) => 
                o.name.toLowerCase().includes(client.name.toLowerCase()) || 
                client.name.toLowerCase().includes(o.name.toLowerCase())
              );
              if (!org) org = organizations[0];

              if (org?.organization_id) {
                const coaRes = await fetch(`${apiBase}/chartofaccounts?organization_id=${org.organization_id}`, {
                  headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
                });
                coaData = await coaRes.json();
                if (coaData.chartofaccounts) break;
              }
            } catch (err: any) { continue; }
          }

          if (coaData?.chartofaccounts) chartOfAccounts = coaData.chartofaccounts;
          else error = "Failed to connect to Zoho Books. Please ensure your organization name matches Zoho.";
        } catch (e: any) { error = e.message; }
      }
    } else if (client.software === "TALLY") {
      try {
        const uniqueLedgers = await prisma.tallyVoucher.findMany({
          where: { clientId: id },
          select: { ledgerName: true },
          distinct: ['ledgerName']
        });
        
        chartOfAccounts = uniqueLedgers.map((l: any) => ({
          account_name: l.ledgerName,
          account_type: "Tally Ledger",
          account_id: l.ledgerName
        }));
      } catch (e: any) {
        error = e.message;
      }
    }

    return NextResponse.json({
      error,
      software: client.software,
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
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "ACCOUNTANT");

    await prisma.pNLMapping.deleteMany({ where: { clientId: id } });
    await prisma.pNLMapping.createMany({
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
