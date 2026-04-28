import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";

// Helper to get Zoho Access Token
async function getZohoAccessToken(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || !client.oauthToken) return null;

  const tokens = JSON.parse(client.oauthToken);
  const config = OAUTH_CONFIGS[client.software];

  const refreshResponse = await fetch(config.tokenUrl, {
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
    await prisma.client.update({
      where: { id: clientId },
      data: { oauthToken: JSON.stringify({ ...tokens, ...newTokens }) },
    });
    return newTokens.access_token;
  }
  return tokens.access_token;
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

    // If Zoho, fetch real COA
    if (client.software === "ZOHO") {
      if (!client.oauthToken) {
        error = "Zoho account not linked. Please link your account in the Client Hub first.";
      } else {
        try {
          const accessToken = await getZohoAccessToken(id);
          
          // Try .in first (common in India), fallback to .com
          let coaData: any = null;
          const domains = ["https://books.zoho.in", "https://books.zoho.com"];
          
          for (const domain of domains) {
            const orgsRes = await fetch(`${domain}/api/v3/organizations`, {
              headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
            });
            const orgsData = await orgsRes.json();
            const orgId = orgsData.organizations?.[0]?.organization_id;

            if (orgId) {
              const coaRes = await fetch(`${domain}/api/v3/chartofaccounts?organization_id=${orgId}`, {
                headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
              });
              coaData = await coaRes.json();
              if (coaData.chartofaccounts) break;
            }
          }

          if (coaData?.chartofaccounts) {
            chartOfAccounts = coaData.chartofaccounts;
          } else {
            error = "Could not fetch data from Zoho. Please check your connection.";
          }
        } catch (e: any) {
          error = "Zoho Error: " + e.message;
        }
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
  const { mappings } = await req.json(); // Array of { sectorHead: string, softwareLedgerName: string }

  try {
    // Delete old mappings and insert new ones
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
