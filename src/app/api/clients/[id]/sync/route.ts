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

    // 2. Fetch Organizations
    const orgsRes = await fetch("https://books.zoho.in/api/v3/organizations", {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
    });
    const orgsData = await orgsRes.json();
    
    // Find the org that matches our client name, or fallback to first one
    const matchingOrg = orgsData.organizations?.find((o: any) => 
      o.name.toLowerCase().includes(client.name.toLowerCase()) || 
      client.name.toLowerCase().includes(o.name.toLowerCase())
    ) || orgsData.organizations?.[0];

    const orgId = matchingOrg?.organization_id;
    const orgName = matchingOrg?.name;

    if (!orgId) throw new Error("No Zoho organization found. Checked: " + JSON.stringify(orgsData.organizations?.map((o:any)=>o.name)));

    // 3. Fetch Profit and Loss for the current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const plRes = await fetch(`https://books.zoho.in/api/v3/reports/profitandloss?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
    });
    const plData = await plRes.json();

    // Fetch Balance Sheet for Assets/Liabilities
    const bsRes = await fetch(`https://books.zoho.in/api/v3/reports/balancesheet?organization_id=${orgId}&date=${lastDay}`, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` }
    });
    const bsData = await bsRes.json();

    // Map Zoho Report Data
    // Note: Zoho P&L returns income/expense groups
    const pl = plData.profitandloss || {};
    const revenue = (pl.income_accounts?.total_income || 0) + (pl.operating_income_accounts?.total_operating_income || 0);
    const cogs = (pl.cost_of_goods_sold_accounts?.total_cost_of_goods_sold || 0);
    const expenses = (pl.expense_accounts?.total_expense || 0) + (pl.operating_expense_accounts?.total_operating_expense || 0);
    const netIncome = pl.net_profit || 0;

    const bs = bsData.balancesheet || {};
    const assets = bs.asset_accounts?.total_assets || 0;
    const liabilities = bs.liability_accounts?.total_liabilities || 0;
    const cash = bs.asset_accounts?.total_cash_and_bank || 0;

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
        netIncome,
        totalAssets: assets,
        currentLiabilities: liabilities,
        cashBalance: cash,
        source: `Zoho: ${orgName}`
      },
      create: {
        clientId: id,
        period,
        revenue,
        cogs,
        operatingExpenses: expenses,
        netIncome,
        totalAssets: assets,
        currentLiabilities: liabilities,
        cashBalance: cash,
        source: `Zoho: ${orgName}`
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Synced ${orgName} for ${period}`,
      details: { revenue, expenses, netIncome }
    });

  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
