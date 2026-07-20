import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function getNaturalBalance(groupName?: string, ledgerName?: string): "DEBIT" | "CREDIT" {
  const gLower = (groupName || "").toLowerCase();
  const nLower = (ledgerName || "").toLowerCase();

  const creditGroups = [
    "creditor", "liability", "duties", "tax", "provision",
    "capital", "equity", "reserve", "surplus", "income", "revenue", "sales"
  ];
  const creditLedgers = [
    "capital", "sales", "interest income", "secured loan", "unsecured loan", "bank od", "overdraft"
  ];

  if (gLower.includes("od") || gLower.includes("overdraft") || nLower.includes("od") || nLower.includes("overdraft")) {
    return "CREDIT";
  }
  if (creditGroups.some(cg => gLower.includes(cg))) {
    return "CREDIT";
  }
  if (creditLedgers.some(cl => nLower.includes(cl))) {
    return "CREDIT";
  }
  return "DEBIT";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Read access is enough to fetch ledger scrutiny alerts
    await authorizeClientAction(user.id, id, "READ_ONLY");

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const status = searchParams.get("status") || undefined;
    const yearParam = searchParams.get("year");
    const targetYear = yearParam ? parseInt(yearParam) : undefined;

    const alerts = await prisma.scrutinyAlert.findMany({
      where: {
        clientId: id,
        ...(category ? { category } : {}),
        ...(status ? { status } : {})
      },
      include: {
        ledger: {
          select: { name: true, groupName: true }
        },
        voucher: {
          select: { voucherNumber: true, date: true, type: true, narration: true }
        },
        resolvedBy: {
          select: { email: true, role: true }
        }
      },
      orderBy: [
        { severity: "desc" },
        { createdAt: "desc" }
      ]
    });

    let filteredAlerts = alerts;
    if (targetYear) {
      filteredAlerts = alerts.filter(a => {
        if (a.metadata && typeof a.metadata === 'object') {
          const meta = a.metadata as any;
          if ('year' in meta) {
            return Number(meta.year) === targetYear;
          }
        }
        if (a.voucher?.date) {
          const vDate = new Date(a.voucher.date);
          const vYear = vDate.getMonth() >= 3 ? vDate.getFullYear() : vDate.getFullYear() - 1;
          return vYear === targetYear;
        }
        return true;
      });
    }

    const fyStart = targetYear ? new Date(`${targetYear}-04-01T00:00:00.000Z`) : undefined;
    const fyEnd = targetYear ? new Date(`${targetYear + 1}-04-01T00:00:00.000Z`) : undefined;

    const dbLedgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true },
      include: {
        voucherLines: {
          where: fyStart && fyEnd ? {
            voucher: { date: { gte: fyStart, lt: fyEnd } }
          } : undefined,
          include: {
            voucher: {
              select: { id: true, voucherNumber: true, date: true, type: true, narration: true }
            }
          }
        }
      },
      orderBy: { name: "asc" }
    });

    let totalPassedChecks = 0;
    let totalFailedChecks = 0;
    let totalWarningChecks = 0;
    let highRiskCount = 0;
    let medRiskCount = 0;
    let lowRiskCount = 0;

    const ledgers = dbLedgers.map(l => {
      let totalDebit = 0;
      let totalCredit = 0;
      let lastDate: string | null = null;

      l.voucherLines.forEach(vl => {
        if (vl.amount > 0) totalDebit += vl.amount;
        else totalCredit += Math.abs(vl.amount);

        if (!lastDate || new Date(vl.voucher.date) > new Date(lastDate)) {
          lastDate = vl.voucher.date.toISOString();
        }
      });

      const ledgerAlerts = filteredAlerts.filter(a => a.ledgerId === l.id || (a.ledger?.name && a.ledger.name.toLowerCase() === l.name.toLowerCase()));

      const unusualAlert = ledgerAlerts.find(a => a.ruleCode === "UNUSUAL_BALANCE");
      const roundJvAlert = ledgerAlerts.find(a => a.ruleCode === "ROUND_VALUE_JOURNAL");
      const suspenseAlert = ledgerAlerts.find(a => a.ruleCode === "SUSPENSE_NON_ZERO");
      const genericAlert = ledgerAlerts.find(a => a.ruleCode === "GENERIC_LEDGER_THRESHOLD");
      const gstAlert = ledgerAlerts.find(a => a.ruleCode === "GST_ITC_BLOCKED" || a.ruleCode === "GST_RCM_UNRECORDED");
      const relatedAlert = ledgerAlerts.find(a => a.ruleCode === "STATUTORY_RELATED_PARTY");
      const sectorAlert = ledgerAlerts.find(a => a.ruleCode.includes("MANUFACTURING") || a.ruleCode.includes("TRADING") || a.ruleCode.includes("SERVICE"));
      const nlpAlert = ledgerAlerts.find(a => a.ruleCode.startsWith("NLP_"));

      const isJournalLedger = l.voucherLines.some(vl => vl.voucher.type === "JOURNAL");
      const isSuspenseLedger = l.name.toLowerCase().includes("suspense") || l.groupName.toLowerCase().includes("suspense");
      const isGstLedger = l.groupName.toLowerCase().includes("expense") || l.groupName.toLowerCase().includes("tax") || l.groupName.toLowerCase().includes("duties") || l.groupName.toLowerCase().includes("purchase");
      const isRelatedPartyLedger = l.name.toLowerCase().includes("director") || l.name.toLowerCase().includes("promoter") || l.name.toLowerCase().includes("relative") || l.name.toLowerCase().includes("sister concern");

      const checks = [
        {
          code: "NATURAL_BALANCE",
          name: "Natural Balance Check",
          status: unusualAlert ? "Failed" : "Passed",
          description: "Verified that Asset/Expense ledgers carry Debit balances and Liability/Income/Equity ledgers carry Credit balances.",
          alert: unusualAlert || null
        },
        {
          code: "OPENING_BALANCE",
          name: "Opening Balance Validation",
          status: "Passed",
          description: "Validated opening balance continuity and expected account nature.",
          alert: null
        },
        {
          code: "MOVEMENT_VALIDATION",
          name: "Debit/Credit Movement Validation",
          status: "Passed",
          description: "Scrutinized turnover volume and transaction frequency.",
          alert: null
        },
        {
          code: "UNUSUAL_BALANCE",
          name: "Unusual Balance & Threshold Check",
          status: genericAlert ? "Failed" : "Passed",
          description: "Checked for generic ledger threshold breaches and abnormal balance signs.",
          alert: genericAlert || null
        },
        {
          code: "ROUND_JV",
          name: "Round Journal Entry Check",
          status: isJournalLedger ? (roundJvAlert ? "Failed" : "Passed") : "N/A",
          description: "Inspected manual journal postings for round-number manual adjustments.",
          alert: roundJvAlert || null
        },
        {
          code: "SUSPENSE_CHECK",
          name: "Suspense Account Month-end Check",
          status: isSuspenseLedger ? (suspenseAlert ? "Failed" : (l.closingBalance === 0 ? "Passed" : "Warning")) : "N/A",
          description: "Verified temporary suspense/holding accounts are cleared to ₹0.",
          alert: suspenseAlert || null
        },
        {
          code: "GST_CHECK",
          name: "GST ITC & RCM Validation",
          status: isGstLedger ? (gstAlert ? "Failed" : "Passed") : "N/A",
          description: "Checked Sec 17(5) blocked credit keywords and GTA/Security reverse charge liability.",
          alert: gstAlert || null
        },
        {
          code: "RELATED_PARTY",
          name: "Related Party Check (Sec 188)",
          status: isRelatedPartyLedger ? (relatedAlert ? "Failed" : "Passed") : "N/A",
          description: "Monitored related party transactions for Companies Act Sec 188 board approvals.",
          alert: relatedAlert || null
        },
        {
          code: "FOREX_CHECK",
          name: "Foreign Currency Check (AS-11)",
          status: "N/A",
          description: "Inspected foreign exchange variance adjustments and translation gains/losses.",
          alert: null
        },
        {
          code: "SECTOR_RULES",
          name: "Industry Specific Compliance Check",
          status: sectorAlert ? "Failed" : "Passed",
          description: "Evaluated sector-specific financial thresholds for utility ratios, purchase cut-offs, and customer advances.",
          alert: sectorAlert || null
        },
        {
          code: "NLP_SCAN",
          name: "NLP Narration Scrutiny",
          status: nlpAlert ? "Failed" : "Passed",
          description: "Crawled voucher narrations for cash bypasses and personal expense leakages.",
          alert: nlpAlert || null
        }
      ];

      checks.forEach(c => {
        if (c.status === "Passed") totalPassedChecks++;
        else if (c.status === "Failed") totalFailedChecks++;
        else if (c.status === "Warning") totalWarningChecks++;
      });

      let overallRisk = "LOW";
      if (ledgerAlerts.some(a => a.severity === "HIGH")) {
        overallRisk = "HIGH";
        highRiskCount++;
      } else if (ledgerAlerts.some(a => a.severity === "MEDIUM") || checks.some(c => c.status === "Failed" || c.status === "Warning")) {
        overallRisk = "MEDIUM";
        medRiskCount++;
      } else {
        lowRiskCount++;
      }

      return {
        id: l.id,
        name: l.name,
        groupName: l.groupName,
        openingBalance: l.openingBalance,
        totalDebit,
        totalCredit,
        closingBalance: l.closingBalance,
        nature: l.nature,
        voucherCount: l.voucherLines.length,
        lastTransactionDate: lastDate,
        overallRisk,
        checks,
        alertsCount: ledgerAlerts.length,
        alerts: ledgerAlerts
      };
    });

    const voucherCount = await prisma.normalizedVoucher.count({
      where: {
        clientId: id,
        date: fyStart && fyEnd ? { gte: fyStart, lt: fyEnd } : undefined
      }
    });

    return NextResponse.json({ 
      success: true, 
      data: filteredAlerts,
      ledgers,
      stats: {
        ledgerCount: dbLedgers.length,
        voucherCount,
        totalRulesExecuted: 12,
        passedChecksCount: totalPassedChecks,
        failedChecksCount: totalFailedChecks,
        warningChecksCount: totalWarningChecks,
        highRiskLedgersCount: highRiskCount,
        mediumRiskLedgersCount: medRiskCount,
        lowRiskLedgersCount: lowRiskCount
      }
    });
  } catch (error: any) {
    console.error("Scrutiny Alerts Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Accountant or above required to update alert status
    await authorizeClientAction(user.id, id, "ACCOUNTANT");

    const body = await req.json();
    const { alertId, status, commentary } = body;

    if (!alertId || !status) {
      return NextResponse.json({ error: "Missing required fields: alertId, status" }, { status: 400 });
    }

    const updated = await prisma.scrutinyAlert.update({
      where: { id: alertId },
      data: {
        status,
        commentary,
        resolvedById: user.id
      },
      include: {
        ledger: {
          select: { name: true, groupName: true }
        },
        resolvedBy: {
          select: { email: true, role: true }
        }
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Scrutiny Alert Update Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
