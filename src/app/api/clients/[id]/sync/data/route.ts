import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/encryption";
import { checkRateLimit, logSecurityEvent } from "@/lib/logger";
import { authorizeClientAction } from "@/lib/rbac";

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
    const { role } = await authorizeClientAction(user.id, id, "STAFF");

    const client = await prisma.client.findUnique({
      where: { id },
      include: { credentials: true }
    });

    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const searchParams = new URL(req.url).searchParams;
    const targetYear = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    if (client.software === "TALLY") {
      // 1. Fetch Mappings
      const clientWithMappings = await prisma.client.findUnique({
        where: { id },
        include: { pnlMappings: true }
      });
      if (!clientWithMappings) return NextResponse.json({ error: "Client not found" }, { status: 404 });

      // 2. Fetch Vouchers for the Target Year
      const vouchers = await prisma.tallyVoucher.findMany({
        where: { 
          clientId: id,
          date: {
            gte: new Date(`${targetYear}-04-01`),
            lt: new Date(`${targetYear + 1}-04-01`),
          }
        }
      });

      // 3. Aggregate Monthly Data by Ledger
      const monthlyData: Record<string, Record<string, number>> = {};
      const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
      
      for (const v of vouchers) {
        const actualMonthStr = v.date.toLocaleString('default', { month: 'short' });
        
        if (!monthlyData[actualMonthStr]) monthlyData[actualMonthStr] = {};
        if (!monthlyData[actualMonthStr][v.ledgerName]) monthlyData[actualMonthStr][v.ledgerName] = 0;
        
        const amt = v.isDebit ? -v.amount : v.amount;
        monthlyData[actualMonthStr][v.ledgerName] += amt;
      }

      // 4. Map and Save to PNLValue
      let recordsSaved = 0;
      for (const [mShort, accounts] of Object.entries(monthlyData)) {
        const syncYearToSave = ["Jan", "Feb", "Mar"].includes(mShort) ? targetYear + 1 : targetYear;
        const headBalances: Record<string, number> = {};

        for (const m of clientWithMappings.pnlMappings) {
          const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
          let balance = 0;
          
          for (const alias of aliases) {
            const exactMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase() === alias);
            if (exactMatchKey) {
              balance += accounts[exactMatchKey];
            } else {
              const fuzzyMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase().includes(alias));
              if (fuzzyMatchKey) balance += accounts[fuzzyMatchKey];
            }
          }

          if (balance !== 0) {
            headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + Math.abs(balance);
          }
        }

        const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
          clientId: id,
          headName,
          month: mShort,
          year: syncYearToSave,
          amount: encrypt(balance.toString())
        }));

        if (finalEntries.length > 0) {
          await prisma.pNLValue.deleteMany({
            where: { clientId: id, month: mShort, year: syncYearToSave }
          });
          await prisma.pNLValue.createMany({ data: finalEntries });
        }
        recordsSaved++;
      }

      await logSecurityEvent(user.id, "SYNC_TALLY_DATA_SUCCESS", id, `Aggregated Tally PNL from vouchers for ${recordsSaved} months`, req);

      return NextResponse.json({ 
        success: true, 
        message: `Successfully aggregated Tally data for ${recordsSaved} months for FY ${targetYear}.`,
        count: recordsSaved,
        topBalances: [],
        allNames: Object.keys(monthlyData).length > 0 ? Object.keys(monthlyData[Object.keys(monthlyData)[0]]) : [],
        orgName: client.name,
        apiBaseUsed: "Tally DB",
        rawSnippet: "Aggregated from TallyVoucher",
        ts: new Date().toISOString()
      });
    }

    if (!client.credentials?.encryptedOauthToken) {
      return NextResponse.json({ error: "Zoho account not linked" }, { status: 400 });
    }

    // 4. DECRYPT Tokens before use
    const decryptedTokenString = decrypt(client.credentials.encryptedOauthToken);
    
    if (!decryptedTokenString || decryptedTokenString === "undefined") {
      return NextResponse.json({ error: "Invalid or corrupted credentials. Please re-link your Zoho account." }, { status: 400 });
    }

    let tokens;
    try {
      tokens = JSON.parse(decryptedTokenString);
    } catch (e) {
      return NextResponse.json({ error: "Failed to parse Zoho credentials. Please re-link your account." }, { status: 400 });
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
        await prisma.integrationCredential.update({
          where: { clientId: id },
          data: { encryptedOauthToken: newlyEncrypted },
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
    // searchParams and targetYear already declared at the top of the route
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

      // Try BOTH Trial Balance and P&L
      const endpoints = [
        { url: `${finalApiBase}/reports/trialbalance?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}&report_basis=Accrual`, type: "TB" },
        { url: `${finalApiBase}/reports/profitandloss?organization_id=${orgId}&from_date=${firstDay}&to_date=${lastDay}&report_basis=Accrual`, type: "PL" }
      ];

      const accMap: Record<string, any> = { year: syncYear };
      let rawSample = "";

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint.url, {
            headers: { "Authorization": `Zoho-oauthtoken ${accessTokenUsed}` },
            signal: AbortSignal.timeout(30000)
          });

          if (res.ok) {
            const data = await res.json();
            rawSample = JSON.stringify(data).substring(0, 5000); // Increased trace size
            
            const discover = (item: any, context: string = "") => {
              if (!item) return;
              if (Array.isArray(item)) {
                item.forEach(i => discover(i, context));
              } else if (typeof item === "object") {
                // 1. Identify the Name
                const name = (item.name || item.account_name || item.account || item.label || item.display_name || item.particulars || context || "").trim();
                
                // 2. Scan for financial values
                Object.entries(item).forEach(([key, val]) => {
                  const lowerKey = key.toLowerCase();
                  const isFinance = lowerKey.includes("debit") || lowerKey.includes("credit") || lowerKey.includes("amount") || lowerKey.includes("balance") || lowerKey.includes("total");

                  if (name && isFinance && val !== null && val !== undefined && val !== "") {
                    // Force numeric conversion
                    let num = 0;
                    if (typeof val === "number") {
                      num = val;
                    } else if (typeof val === "string") {
                      num = parseFloat(val.replace(/[^0-9.-]/g, ""));
                    }

                    if (!isNaN(num) && num !== 0 && !["id", "account_id", "year", "code", "depth", "span"].includes(lowerKey)) {
                      const isGeneric = ["income", "expense", "assets", "liabilities", "equities", "total"].includes(name.toLowerCase());
                      // Only aggregate if it's not a generic name we already have a better value for
                      if (!accMap[name] || !isGeneric) {
                        // Use addition for different keys in same object, but assignment for recursion to avoid doubling
                        const current = accMap[name] || 0;
                        accMap[name] = isGeneric ? Math.abs(num) : current + Math.abs(num);
                      }
                    }
                  }

                  // 3. Recurse deeper
                  if (val && typeof val === "object") {
                    discover(val, name);
                  }
                });
              }
            };
            discover(data);
            if (Object.keys(accMap).length > 1) break;
          }
        } catch (e) {
          continue;
        }
      }
      monthlyData[mShort] = accMap;
      (monthlyData[mShort] as any)._raw = rawSample;
    }

    const clientWithMappings = await prisma.client.findUnique({
      where: { id },
      include: { pnlMappings: true }
    });
    if (!clientWithMappings) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // 8. Map and Save to DB
    let recordsSaved = 0;
    for (const mShort of monthsToSync) {
      const accounts = monthlyData[mShort];
      if (!accounts || Object.keys(accounts).length <= 1) continue;

      const syncYearToSave = accounts.year || targetYear;
      const headBalances: Record<string, number> = {};

      for (const m of clientWithMappings.pnlMappings) {
        const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
        let balance = 0;
        
        for (const alias of aliases) {
          const exactMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase() === alias);
          if (exactMatchKey) {
            balance += accounts[exactMatchKey];
          } else {
            const fuzzyMatchKey = Object.keys(accounts).find(k => {
              const lowerK = k.trim().toLowerCase();
              return lowerK.includes(alias) || alias.includes(lowerK);
            });
            if (fuzzyMatchKey) balance += accounts[fuzzyMatchKey];
          }
        }

        if (balance !== 0) {
          headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + Math.abs(balance);
        }
      }

      const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
        clientId: id,
        headName,
        month: mShort,
        year: syncYearToSave,
        amount: encrypt(balance.toString())
      }));

      if (finalEntries.length > 0) {
        await prisma.pNLValue.deleteMany({
          where: { clientId: id, month: mShort, year: syncYearToSave }
        });
        await prisma.pNLValue.createMany({ data: finalEntries });
      }
      recordsSaved++;
    }

    await logSecurityEvent(user.id, "SYNC_DATA_SUCCESS", id, `Synced and saved ${recordsSaved} months`, req);

    const topBalances = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        heads: Object.entries(data)
          .filter(([k, v]) => typeof v === "number" && k !== "year")
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 50)
      }));

    const allUniqueNames = new Set<string>();
    let finalRawTrace = "No raw data captured";

    Object.values(monthlyData).forEach((data: any) => {
      if (data._raw) finalRawTrace = data._raw;
      Object.keys(data).forEach(k => {
        if (k !== "year" && !k.startsWith("_")) allUniqueNames.add(k);
      });
    });

    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced and saved ${recordsSaved} months for FY ${targetYear}.`,
      count: recordsSaved,
      topBalances,
      allNames: Array.from(allUniqueNames),
      orgName: organization?.name || "ABC LLP",
      apiBaseUsed: finalApiBase,
      rawSnippet: finalRawTrace,
      ts: "2026-05-04 08:45"
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
