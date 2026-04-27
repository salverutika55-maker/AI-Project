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
    });

    if (!client || !client.oauthToken) {
      return NextResponse.json({ error: "Client not linked to any software" }, { status: 400 });
    }

    const tokens = JSON.parse(client.oauthToken);
    const config = OAUTH_CONFIGS[client.software];
    
    // 1. Refresh Token if needed
    let accessToken = tokens.access_token;
    
    // We'll refresh every time to be safe for now, or you can check expiry
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
      accessToken = newTokens.access_token;
      // Update DB with new access token
      await prisma.client.update({
        where: { id },
        data: {
          oauthToken: JSON.stringify({ ...tokens, ...newTokens }),
        },
      });
    }

    // 2. Fetch Organizations (to get org_id)
    const orgsRes = await fetch("https://books.zoho.in/api/v3/organizations", {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
    });
    const orgsData = await orgsRes.json();
    const orgId = orgsData.organizations?.[0]?.organization_id;

    if (!orgId) throw new Error("No Zoho organization found");

    // 3. Fetch Trial Balance for the current year
    // We'll fetch the last 12 months of data
    const now = new Date();
    const records = [];

    // Simple implementation: Fetch one Trial Balance report
    // For a more complex dashboard, we would fetch monthly movements
    const tbRes = await fetch(`https://books.zoho.in/api/v3/reports/trialbalance?organization_id=${orgId}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
    });
    const tbData = await tbRes.json();

    // Map Zoho account types to our schema
    // This is a simplified mapping for demonstration
    let revenue = 0;
    let cogs = 0;
    let expenses = 0;
    let assets = 0;
    let liabilities = 0;

    tbData.trialbalance?.trialbalance_details?.forEach((acc: any) => {
      if (acc.account_type === "income") revenue += acc.net_credit_total - acc.net_debit_total;
      if (acc.account_type === "expense") expenses += acc.net_debit_total - acc.net_credit_total;
      if (acc.account_type === "cost_of_goods_sold") cogs += acc.net_debit_total - acc.net_credit_total;
      if (["fixed_asset", "other_asset", "bank", "cash"].includes(acc.account_type)) assets += acc.net_debit_total - acc.net_credit_total;
      if (["other_current_liability", "long_term_liability"].includes(acc.account_type)) liabilities += acc.net_credit_total - acc.net_debit_total;
    });

    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Save/Update current month record
    await prisma.financialRecord.upsert({
      where: {
        clientId_period: { clientId: id, period }
      },
      update: {
        revenue,
        cogs,
        operatingExpenses: expenses,
        netIncome: revenue - cogs - expenses,
        totalAssets: assets,
        currentLiabilities: liabilities,
        source: "Zoho Books"
      },
      create: {
        clientId: id,
        period,
        revenue,
        cogs,
        operatingExpenses: expenses,
        netIncome: revenue - cogs - expenses,
        totalAssets: assets,
        currentLiabilities: liabilities,
        source: "Zoho Books"
      }
    });

    return NextResponse.json({ success: true, message: "Data synced from Zoho Books" });

  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
