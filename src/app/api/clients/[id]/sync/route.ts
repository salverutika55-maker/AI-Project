import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { encrypt, decrypt } from "@/lib/encryption";

export const maxDuration = 60; // Extend to 60s for Zoho Sync

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 1. RBAC Authorization: User must be at least STAFF
    await authorizeClientAction(user.id, id, "STAFF");

    const client = await prisma.client.findUnique({
      where: { id },
      include: { 
        pnlMappings: true,
        credentials: true
      }
    });

    if (!client || !client.credentials?.encryptedOauthToken) {
      return NextResponse.json({ error: "Client not linked to any software or credentials missing" }, { status: 400 });
    }

    // 2. Vault Decryption (In-Memory Only)
    const rawTokenString = decrypt(client.credentials.encryptedOauthToken);
    const tokens = JSON.parse(rawTokenString);
    
    // Use the accounts server from the token if available, otherwise fallback to .in
    const accountsUrl = tokens.accounts_url || "https://accounts.zoho.in";
    const tokenUrl = `${accountsUrl}/oauth/v2/token`;
    
    // Ensure we use the 'books' domain for Books API
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
      
      // Re-encrypt and store in Vault
      const updatedTokenString = JSON.stringify({ ...tokens, ...newTokens });
      await prisma.integrationCredential.update({
        where: { clientId: id },
        data: { encryptedOauthToken: encrypt(updatedTokenString) },
      });
    }

    // 2. Fetch Zoho Organization (Cache it in tokens to save time next sync)
    let orgId = tokens.organization_id;
    if (!orgId) {
      const orgsRes = await fetch(`${apiDomain}/api/v3/organizations`, {
        headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
      });
      const orgsData = await orgsRes.json();
      orgId = orgsData.organizations?.[0]?.organization_id;
      if (!orgId) throw new Error("No Zoho organization found");
      
      // Update vault with orgId for future use
      const updatedTokenString = JSON.stringify({ ...tokens, ...(newTokens.access_token ? newTokens : {}), organization_id: orgId });
      await prisma.integrationCredential.update({
        where: { clientId: id },
        data: { encryptedOauthToken: encrypt(updatedTokenString) },
      });
    }

    // 3. Fetch Trial Balance (Current Month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const monthName = now.toLocaleString('default', { month: 'short' });
    const year = now.getFullYear();

    const tbRes = await fetch(`${apiDomain}/api/v3/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
    });
    const tbData = await tbRes.json();
    const accounts = tbData.trialbalance?.trial_balance_details || [];

    // 4. Map Data to P&L Heads
    const results: Record<string, number> = {};
    
    client.pnlMappings.forEach(mapping => {
      const account = accounts.find((a: any) => a.account_name === mapping.softwareLedgerName);
      if (account) {
        // Zoho TB has credit_amount and debit_amount. 
        // For P&L, balance = Credit - Debit (for Income) or Debit - Credit (for Expense)
        // Usually, Trial Balance reports provide net balance. 
        const balance = (account.credit_amount || 0) - (account.debit_amount || 0);
        
        if (!results[mapping.sectorHead]) results[mapping.sectorHead] = 0;
        results[mapping.sectorHead] += Math.abs(balance); // Using absolute for now, refined logic needed later
      }
    });

    // 5. Save to PNLValue in parallel for speed
    await Promise.all(Object.entries(results).map(([head, amount]) => {
      const encryptedAmount = encrypt(amount.toString());
      return prisma.pNLValue.upsert({
        where: {
          clientId_headName_month_year: {
            clientId: id,
            headName: head,
            month: monthName,
            year: year
          }
        },
        update: { amount: encryptedAmount },
        create: {
          clientId: id,
          headName: head,
          month: monthName,
          year: year,
          amount: encryptedAmount
        }
      });
    }));

    return NextResponse.json({ 
      success: true, 
      message: `Synced ${client.pnlMappings.length} mappings for ${monthName} ${year}` 
    });

  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
