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
      return NextResponse.json({ error: "Client not linked to any software" }, { status: 400 });
    }

    const tokens = JSON.parse(client.oauthToken);
    const config = OAUTH_CONFIGS[client.software];
    
    // 1. Refresh Token
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
    let accessToken = tokens.access_token;
    if (newTokens.access_token) {
      accessToken = newTokens.access_token;
      await prisma.client.update({
        where: { id },
        data: { oauthToken: JSON.stringify({ ...tokens, ...newTokens }) },
      });
    }

    // 2. Fetch Zoho Organization
    const orgsRes = await fetch("https://books.zoho.in/api/v3/organizations", {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
    });
    const orgsData = await orgsRes.json();
    const orgId = orgsData.organizations?.[0]?.organization_id;
    if (!orgId) throw new Error("No Zoho organization found");

    // 3. Fetch Trial Balance (Current Month for now)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const monthName = now.toLocaleString('default', { month: 'short' });
    const year = now.getFullYear();

    const tbRes = await fetch(`https://books.zoho.in/api/v3/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
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

    // 5. Save to PNLValue
    for (const [head, amount] of Object.entries(results)) {
      await prisma.pNLValue.upsert({
        where: {
          clientId_headName_month_year: {
            clientId: id,
            headName: head,
            month: monthName,
            year: year
          }
        },
        update: { amount },
        create: {
          clientId: id,
          headName: head,
          month: monthName,
          year: year,
          amount
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Synced ${client.pnlMappings.length} mappings for ${monthName} ${year}` 
    });

  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
