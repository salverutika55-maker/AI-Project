import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });

    if (!client || !client.oauthToken) {
      return NextResponse.json({ error: "Client not linked" }, { status: 400 });
    }

    const tokens = JSON.parse(client.oauthToken);
    const accountsUrl = tokens.accounts_url || "https://accounts.zoho.in";
    const tokenUrl = `${accountsUrl}/oauth/v2/token`;
    
    let apiDomain = tokens.api_domain || "https://books.zoho.in";
    if (!apiDomain.includes("books.")) {
      apiDomain = apiDomain.replace(/^https:\/\/(www\.|api\.|)/, "https://books.");
    }
    
    const config = OAUTH_CONFIGS[client.software];
    
    // 1. Refresh Token
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
    let accessToken = tokens.access_token;
    if (newTokens.access_token) {
      accessToken = newTokens.access_token;
      await prisma.client.update({
        where: { id },
        data: { oauthToken: JSON.stringify({ ...tokens, ...newTokens }) },
      });
    }

    // 2. Org ID
    let orgId = tokens.organization_id;
    if (!orgId) {
      const orgsRes = await fetch(`${apiDomain}/api/v3/organizations`, {
        headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
      });
      const orgsData = await orgsRes.json();
      orgId = orgsData.organizations?.[0]?.organization_id;
      if (!orgId) throw new Error("No organization found");
    }

    // 3. Fetch Data
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const tbRes = await fetch(`${apiDomain}/api/v3/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
    });
    const tbData = await tbRes.json();
    const accounts = tbData.trialbalance?.trial_balance_details || [];

    // Return the data for processing on frontend
    return NextResponse.json({ accounts, mappings: client.pnlMappings });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
