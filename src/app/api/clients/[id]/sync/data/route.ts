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
    
    // 1. Refresh Token (ONLY if needed - or try current first to save time)
    let accessToken = tokens.access_token;
    
    // 2. Org ID (Always use cached if available)
    let orgId = tokens.organization_id;

    // Try a "Fast Fetch" first with existing token
    if (accessToken && orgId) {
      try {
        const fastRes = await fetch(`${apiDomain}/api/v3/reports/trialbalance?organization_id=${orgId}&from_date=${new Date().toISOString().split('T')[0]}&to_date=${new Date().toISOString().split('T')[0]}`, {
          headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
          signal: AbortSignal.timeout(3000) // Very fast check
        });
        if (!fastRes.ok) throw new Error("Need refresh");
        // If ok, we can proceed with this token!
      } catch (e) {
        // Need to refresh
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
          
          // Fetch Org ID if missing
          if (!orgId) {
             const orgsRes = await fetch(`${apiDomain}/api/v3/organizations`, {
               headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
             });
             const orgsData = await orgsRes.json();
             orgId = orgsData.organizations?.[0]?.organization_id;
             updatedTokens.organization_id = orgId;
          }

          await prisma.client.update({
            where: { id },
            data: { oauthToken: JSON.stringify(updatedTokens) },
          });
        }
      }
    } else {
      // Standard full refresh if no cached data
      // ... (existing refresh logic)
    }

    // 3. Fetch Data with a timeout to avoid hanging
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const tbRes = await fetch(`${apiDomain}/api/v3/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
      signal: AbortSignal.timeout(15000) // 15s timeout
    });

    if (!tbRes.ok) {
      const errorData = await tbRes.json().catch(() => ({}));
      throw new Error(`Zoho API Error (${tbRes.status}): ${errorData.message || tbRes.statusText}`);
    }

    const tbData = await tbRes.json();
    if (!tbData.trialbalance) {
      throw new Error(tbData.message || "Trial Balance data missing from Zoho response.");
    }

    const accounts = tbData.trialbalance?.trial_balance_details || [];

    // Return the data for processing on frontend
    return NextResponse.json({ accounts, mappings: client.pnlMappings });

  } catch (error: any) {
    console.error("Sync Data Fetch Error:", error);
    let message = error.message;
    if (error.name === "TimeoutError") message = "Zoho took too long to respond. This often happens on limited hosting plans.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
