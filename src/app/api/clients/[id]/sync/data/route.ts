import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { decrypt, encrypt } from "@/lib/encryption";
import { checkRateLimit, logSecurityEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
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
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 2. Rate Limiting (Prevent Spamming Zoho API)
    // Limit to 5 syncs per 10 minutes per user/client combo
    const limitKey = `sync:${user.id}:${id}`;
    const { success, remaining } = await checkRateLimit(limitKey, 5, 10 * 60 * 1000);
    if (!success) {
      await logSecurityEvent(user.id, "RATE_LIMIT_EXCEEDED", id, "User hit sync rate limit", req);
      return NextResponse.json({ error: "Rate limit exceeded. Please wait 10 minutes." }, { status: 429 });
    }

    // 3. Authorization & Ownership Check
    const client = await prisma.client.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    if (user.role !== "ADMIN" && client.userId !== user.id) {
      await logSecurityEvent(user.id, "UNAUTHORIZED_SYNC_ATTEMPT", id, `Attempted to sync client ${id}`, req);
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    if (!client.oauthToken) {
      return NextResponse.json({ error: "Zoho account not linked" }, { status: 400 });
    }

    // 4. DECRYPT Tokens before use
    const decryptedTokenString = decrypt(client.oauthToken);
    
    // Safety check: Attempt to parse, fallback to original if it's already an object string
    let tokens;
    try {
      tokens = JSON.parse(decryptedTokenString);
    } catch (e) {
      // If parsing fails, it might already be an object from a previous partial sync
      tokens = typeof decryptedTokenString === 'object' ? decryptedTokenString : JSON.parse(client.oauthToken);
    }
    
    const accountsUrl = tokens.accounts_url || "https://accounts.zoho.in";
    const tokenUrl = `${accountsUrl}/oauth/v2/token`;
    
    let apiDomain = tokens.api_domain || "https://www.zohoapis.in";
    
    const config = OAUTH_CONFIGS[client.software];
    let accessToken = tokens.access_token;
    
    // Fetch Organization ID first
    const orgsRes = await fetch(`${apiDomain}/books/v3/organizations`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
      signal: AbortSignal.timeout(5000)
    });
    
    if (!orgsRes.ok) {
      if (orgsRes.status === 401) {
        // We will handle refresh token logic below
      } else {
        const errorText = await orgsRes.text().catch(() => "");
        throw new Error(`Failed to fetch organizations (Zoho ${orgsRes.status}): ${errorText}`);
      }
    }
    
    let orgId = "";
    if (orgsRes.ok) {
      const orgsData = await orgsRes.json();
      orgId = orgsData.organizations?.[0]?.organization_id;
      if (!orgId) throw new Error("No organizations found in your Zoho account.");
    }

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    let tbRes = await fetch(`${apiDomain}/books/v3/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
      signal: AbortSignal.timeout(8000)
    });

    // Fetch Cumulative Trial Balance (for Balance Sheet items)
    let cumulativeTbRes = await fetch(`${apiDomain}/books/v3/reports/trialbalance?organization_id=${orgId}&to_date=${lastDay}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
      signal: AbortSignal.timeout(8000)
    });

    if (tbRes.status === 401 || orgsRes.status === 401 || cumulativeTbRes.status === 401) {
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
        const newlyEncrypted = encrypt(JSON.stringify(updatedTokens));
        await prisma.client.update({
          where: { id },
          data: { oauthToken: newlyEncrypted },
        }).catch(console.error);

        // Retry Organization Fetch if it failed
        if (!orgId) {
          const retryOrgsRes = await fetch(`${apiDomain}/books/v3/organizations`, {
            headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
          });
          if (retryOrgsRes.ok) {
            const orgsData = await retryOrgsRes.json();
            orgId = orgsData.organizations?.[0]?.organization_id;
          }
        }

        // Retry Trial Balance Fetch
        if (orgId) {
          tbRes = await fetch(`${apiDomain}/books/v3/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
            headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
            signal: AbortSignal.timeout(8000)
          });
          cumulativeTbRes = await fetch(`${apiDomain}/books/v3/reports/trialbalance?organization_id=${orgId}&to_date=${lastDay}`, {
            headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
            signal: AbortSignal.timeout(8000)
          });
        } else {
          throw new Error("No organizations found after token refresh.");
        }
      } else {
        throw new Error("Token refresh failed. Please re-link your Zoho account.");
      }
    }

    if (!tbRes.ok || !cumulativeTbRes.ok) {
      const errorText = await tbRes.text().catch(() => "");
      throw new Error(`Zoho error ${tbRes.status}: ${errorText}`);
    }

    const tbData = await tbRes.json();
    const cumulativeTbData = await cumulativeTbRes.json();
    
    const accounts = tbData.trialbalance?.trial_balance_details || [];
    const cumulativeAccounts = cumulativeTbData.trialbalance?.trial_balance_details || [];

    const clientWithMappings = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });

    await logSecurityEvent(user.id, "SYNC_DATA_SUCCESS", id, `Fetched ${accounts.length} monthly and ${cumulativeAccounts.length} cumulative accounts from Zoho`, req);

    return NextResponse.json({ 
      accounts, 
      cumulativeAccounts,
      mappings: clientWithMappings?.pnlMappings || [] 
    });

  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
