import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
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
    
    let accessToken = tokens.access_token;
    let orgId = tokens.organization_id;

    // STEP 1: Direct Fetch (Try with existing token immediately)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    let tbRes = await fetch(`${apiDomain}/api/v3/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
      signal: AbortSignal.timeout(8000) // 8s timeout for the whole thing
    });

    // STEP 2: If 401, Refresh once and retry
    if (tbRes.status === 401) {
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
        accessToken = newTokens.access_token;
        const updatedTokens = { ...tokens, ...newTokens };
        
        // Retry fetch with new token
        tbRes = await fetch(`${apiDomain}/api/v3/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
          headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
          signal: AbortSignal.timeout(7000)
        });

        // Save new token in background (don't await to save time)
        prisma.client.update({
          where: { id },
          data: { oauthToken: JSON.stringify(updatedTokens) },
        }).catch(console.error);
      }
    }

    if (!tbRes.ok) {
      const errorData = await tbRes.json().catch(() => ({}));
      throw new Error(errorData.message || `Zoho responded with ${tbRes.status}`);
    }

    const tbData = await tbRes.json();
    const accounts = tbData.trialbalance?.trial_balance_details || [];

    // Also get mappings (we can do this in parallel with TB fetch if we want, but let's keep it simple)
    const clientWithMappings = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });

    return NextResponse.json({ 
      accounts, 
      mappings: clientWithMappings?.pnlMappings || [] 
    });

  } catch (error: any) {
    console.error("Critical Sync Error:", error);
    let message = error.message;
    if (error.name === "TimeoutError") message = "Connection timed out. Please try again in 5 seconds.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
