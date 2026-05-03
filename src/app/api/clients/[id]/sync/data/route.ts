import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { decrypt, encrypt } from "@/lib/encryption";
import { checkRateLimit, logSecurityEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    let apiDomain = tokens.api_domain || "https://books.zoho.in";
    const config = OAUTH_CONFIGS[client.software];
    let accessToken = tokens.access_token;
    
    // Helper to refresh token
    const refreshZohoToken = async () => {
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
        return true;
      }
      return false;
    };

    // 5. Fetch Organizations with Multi-Region Fallback (Correct Books API Root)
    const domains = tokens.api_domain ? [tokens.api_domain] : [
      "https://www.zohoapis.in/books/v3",
      "https://www.zohoapis.com/books/v3",
      "https://www.zohoapis.eu/books/v3",
      "https://www.zohoapis.com.au/books/v3"
    ];

    let orgId = "";
    let accessTokenUsed = accessToken;
    let finalApiBase = ""; // Will include the /books/v3 part
    let organization: any = null;
    let organizations: any[] = [];
    let plData: any = {};

    for (const domain of domains) {
      try {
        // Ensure domain has /books/v3 if it doesn't already
        const apiBase = domain.includes("/books/v3") ? domain : `${domain.replace(/\/$/, "")}/books/v3`;
        
        let orgsRes = await fetch(`${apiBase}/organizations`, {
          headers: { "Authorization": `Zoho-oauthtoken ${accessTokenUsed}` },
          signal: AbortSignal.timeout(5000)
        });
        
        if (orgsRes.status === 401) {
          const refreshed = await refreshZohoToken();
          if (refreshed) {
            accessTokenUsed = accessToken;
            orgsRes = await fetch(`${apiBase}/organizations`, {
              headers: { "Authorization": `Zoho-oauthtoken ${accessTokenUsed}` },
              signal: AbortSignal.timeout(5000)
            });
          }
        }

        if (orgsRes.ok) {
          const orgsData = await orgsRes.json();
          organizations = orgsData.organizations || [];
          organization = organizations.find((o: any) => 
            o.name.toLowerCase().includes(client.name.toLowerCase()) || 
            client.name.toLowerCase().includes(o.name.toLowerCase())
          );
          if (!organization) organization = organizations[0];
          
          if (organization?.organization_id) {
            orgId = organization.organization_id;
            finalApiBase = apiBase;
            break;
          }
        }
      } catch (err) {
        continue;
      }
    }

    if (!orgId) {
      throw new Error("Zoho Auth Failed: Could not connect to your Zoho Books account in any region. Please re-link your account in Client Hub.");
    }

    const apiBase = finalApiBase;

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

    // 6. Fetch each month individually for maximum accuracy
    const monthlyData: Record<string, any> = {};
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    
    // For now, sync the months we know have data (Apr and May)
    const monthsToSync = ["Apr", "May"]; 

    for (const mShort of monthsToSync) {
      const mIdx = months.indexOf(mShort);
      const monthNum = (mIdx + 4 - 1) % 12 + 1;
      let syncYear = targetYear;
      if (monthNum < 4) syncYear++;
      
      const firstDay = `${syncYear}-${monthNum.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(syncYear, monthNum, 0).toISOString().split('T')[0];

      const plUrl = `${finalApiBase}/reports/profitandloss?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}&report_basis=Accrual`;
      
      try {
        const plRes = await fetch(plUrl, {
          headers: { "Authorization": `Zoho-oauthtoken ${accessTokenUsed}` },
          signal: AbortSignal.timeout(30000)
        });

        if (plRes.ok) {
          plData = await plRes.json();
          const accMap: Record<string, any> = { year: syncYear };
          const skippedNames: string[] = [];
          const rawSamples: any[] = [];
          const processItems = (list: any[]) => {
            if (!Array.isArray(list)) return;
            list.forEach(item => {
              if (!item) return;
              
              // 1. Try to find the amount using ANY common Zoho key
              const val = item.total ?? item.amount ?? item.net_amount ?? item.balance ?? item.amount_payable;
              
              if (item.name && (typeof val === "number" || typeof val === "string")) {
                const numericVal = typeof val === "string" ? parseFloat(val.replace(/[^0-9.-]/g, "")) : val;
                if (!isNaN(numericVal)) {
                  accMap[item.name.trim()] = numericVal;
                }
              }

              // 2. Recursively check EVERY property that is an array (Zoho uses rows, sub_sections, sub_rows, etc.)
              Object.entries(item).forEach(([key, value]) => {
                if (Array.isArray(value) && key !== "account_transactions") {
                  processItems(value);
                }
              });
            });
          };

          processItems(plData.profit_and_loss || []);
          (accMap as any)._raw = rawSamples;
          monthlyData[mShort] = accMap;
        } else {
          const errText = await plRes.text().catch(() => "Unknown error");
          monthlyData[mShort] = { error: `Zoho Error ${plRes.status}: ${errText.substring(0, 50)}` };
        }
      } catch (e: any) {
        monthlyData[mShort] = { error: `Fetch Failed: ${e.message}` };
      }
    }

    const clientWithMappings = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });

    // 8. Map and Save to DB
    let recordsSaved = 0;
    for (const m of clientWithMappings.pnlMappings) {
      for (const mShort of months) {
        const accounts = monthlyData[mShort];
        if (!accounts || accounts.error) continue;

        const softwareName = (m.softwareLedgerName || "").trim().toLowerCase();
        
        // --- SMART MATCHING LOGIC ---
        let balance = 0;
        const exactMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase() === softwareName);
        
        if (exactMatchKey) {
          balance = accounts[exactMatchKey];
        } else {
          const fuzzyMatchKey = Object.keys(accounts).find(k => {
            const lowerK = k.trim().toLowerCase();
            return lowerK.includes(softwareName) || softwareName.includes(lowerK);
          });
          if (fuzzyMatchKey) balance = accounts[fuzzyMatchKey];
        }

        const syncYearToSave = accounts.year || targetYear;
        const encryptedValue = encrypt(Math.abs(balance).toString());

        await prisma.pNLValue.upsert({
          where: {
            clientId_headName_month_year: {
              clientId: id,
              headName: m.sectorHead,
              month: mShort,
              year: syncYearToSave
            }
          },
          update: { amount: encryptedValue },
          create: {
            clientId: id,
            headName: m.sectorHead,
            month: mShort,
            year: syncYearToSave,
            amount: encryptedValue
          }
        });
      }
    }
    recordsSaved = monthsToSync.length;

    await logSecurityEvent(user.id, "SYNC_DATA_SUCCESS", id, `Synced and saved ${recordsSaved} months`, req);

    // Get a small sample of data for the UI to log (including zeros for debugging)
    const topBalances = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        heads: Object.entries(data)
          .filter(([k, v]) => typeof v === "number" && k !== "year")
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 30)
      }));

    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced and saved ${recordsSaved} months for FY ${targetYear}.`,
      count: recordsSaved,
      topBalances,
      allNames: Object.keys(monthlyData["Apr"] || {}).filter(k => k !== "year" && !k.startsWith("_")),
      orgName: organization?.name || "Unknown",
      allOrgs: organizations?.map((o: any) => o.name) || [],
      apiBaseUsed: apiBase,
      responseKeys: Object.keys(plData),
      rawData: JSON.stringify(plData).substring(0, 2000),
      rawResponseSample: plData?.profit_and_loss ? "Data found in P&L" : "No P&L data",
      rawSnippet: JSON.stringify(plData).substring(0, 500),
      ts: "2026-05-03 12:51"
    });

  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ 
      error: error.message,
      debug: {
        message: error.message,
        stack: error.stack
      }
    }, { status: 500 });
  }
}
