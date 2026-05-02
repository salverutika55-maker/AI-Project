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
    const searchParams = new URL(req.url).searchParams;
    const targetYear = parseInt(searchParams.get("year") || String(now.getFullYear()));
    const fyType = searchParams.get("fyType") || "APR_MAR";

    // Determine date range for the full fiscal year
    let fromDate = `${targetYear}-04-01`;
    let toDate = `${targetYear + 1}-03-31`;
    
    if (fyType === "JAN_DEC") {
      fromDate = `${targetYear}-01-01`;
      toDate = `${targetYear}-12-31`;
    }

    // Fetch Profit and Loss with monthly breakdown
    const plUrl = `${apiDomain}/books/v3/reports/profitandloss?organization_id=${orgId}&from_date=${fromDate}&to_date=${toDate}&breakdown=month`;
    
    const plRes = await fetch(plUrl, {
      headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
      signal: AbortSignal.timeout(10000)
    });

    if (!plRes.ok) {
      const errorText = await plRes.text().catch(() => "");
      throw new Error(`Zoho P&L Error ${plRes.status}: ${errorText}`);
    }

    const plData = await plRes.json();
    
    // Zoho P&L breakdown returns an array of columns (months) and rows (accounts)
    // We need to extract the data per month
    const monthlyData: Record<string, Record<string, number>> = {};
    const columns = plData.profit_and_loss?.columns || [];
    const sections = plData.profit_and_loss?.sections || [];

    // Map month names from columns (e.g., "April 2026") to short names ("Apr")
    const columnMap = columns.map((col: any) => {
      const date = new Date(col.label);
      return {
        id: col.column_id,
        shortMonth: date.toLocaleString('default', { month: 'short' }),
        year: date.getFullYear()
      };
    });

    const extractRows = (rows: any[]) => {
      rows.forEach((row: any) => {
        if (row.account_name && row.values) {
          row.values.forEach((val: any) => {
            const colInfo = columnMap.find((c: any) => c.id === val.column_id);
            if (colInfo) {
              const m = colInfo.shortMonth;
              if (!monthlyData[m]) monthlyData[m] = { year: colInfo.year };
              monthlyData[m][row.account_name] = (monthlyData[m][row.account_name] || 0) + (val.value || 0);
            }
          });
        }
        if (row.sub_sections) {
          row.sub_sections.forEach((sub: any) => extractRows(sub.rows || []));
        }
        if (row.rows) extractRows(row.rows);
      });
    };

    sections.forEach((sec: any) => extractRows(sec.rows || []));

    const clientWithMappings = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });

    await logSecurityEvent(user.id, "SYNC_DATA_SUCCESS", id, `Fetched full FY monthly breakdown from Zoho P&L`, req);

    return NextResponse.json({ 
      monthlyData,
      mappings: clientWithMappings?.pnlMappings || [] 
    });

  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
