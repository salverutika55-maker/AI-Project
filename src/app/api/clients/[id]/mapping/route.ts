import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";

// Helper to get Zoho Access Token
async function getZohoAccessToken(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || !client.oauthToken) throw new Error("No Zoho account linked.");

  const tokens = JSON.parse(client.oauthToken);
  
  // Use the accounts server from the token if available
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
      await prisma.client.update({
        where: { id: clientId },
        data: { oauthToken: JSON.stringify(updatedTokens) },
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

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });

    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    let chartOfAccounts: any[] = [];
    let error: string | null = null;
    let debug: any = {};

    if (client.software === "ZOHO") {
      if (!client.oauthToken) {
        error = "Zoho account not linked. Please link your account in the Client Hub first.";
      } else {
        try {
          const { token: accessToken, tokens } = await getZohoAccessToken(id);
          
          const baseDomains = [
            "https://books.zoho.in", 
            "https://books.zoho.com", 
            "https://books.zoho.eu", 
            "https://books.zoho.com.au"
          ];

          if (tokens.api_domain) {
            const domainUrl = new URL(tokens.api_domain);
            let host = domainUrl.hostname;
            if (!host.startsWith("books.")) {
              host = host.replace(/^www\.|^api\.|^/, "books.");
            }
            baseDomains.unshift(`https://${host}`);
          }
          
          const domains = [...new Set(baseDomains)];
          debug.attemptedDomains = domains;
          
          let coaData: any = null;
          let lastError = "";
          
          for (const domain of domains) {
            try {
              const orgsRes = await fetch(`${domain}/api/v3/organizations`, {
                headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
                signal: AbortSignal.timeout(5000)
              });
              
              if (!orgsRes.ok) {
                lastError = `${domain} returned ${orgsRes.status}`;
                if (orgsRes.status === 401) {
                  lastError = `Unauthorized (401) on ${domain}. Your session might have expired.`;
                }
                continue;
              }

              const orgsData = await orgsRes.json();
              const orgId = orgsData.organizations?.[0]?.organization_id;

              if (orgId) {
                const coaRes = await fetch(`${domain}/api/v3/chartofaccounts?organization_id=${orgId}`, {
                  headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
                });
                coaData = await coaRes.json();
                if (coaData.chartofaccounts) {
                  debug.successDomain = domain;
                  break;
                }
              }
            } catch (err: any) {
              lastError = err.message;
              continue;
            }
          }

          if (coaData?.chartofaccounts) {
            chartOfAccounts = coaData.chartofaccounts;
          } else {
            error = `Failed to connect to Zoho Books. ${lastError}`;
          }
        } catch (e: any) {
          error = e.message;
        }
      }
    }

    return NextResponse.json({
      error,
      debug,
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

  try {
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
