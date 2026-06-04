import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { decrypt } from "@/lib/encryption";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await authorizeClientAction(user.id, id, "READ_ONLY");

    // Fetch some basic data to make the risk insights contextual
    const pnlValues = await prisma.pNLValue.findMany({
      where: { clientId: id, year }
    });

    const decryptValue = (amountStr: string) => {
      try { return parseFloat(decrypt(amountStr)) || parseFloat(amountStr) || 0; }
      catch { return parseFloat(amountStr) || 0; }
    };

    let totalRevenue = 0;
    pnlValues.forEach(v => {
      const h = v.headName.toLowerCase();
      if (h.includes("revenue") || h.includes("sales")) {
        totalRevenue += decryptValue(v.amount);
      }
    });

    // Mock AI Risk Generation based on contextual data
    const scale = totalRevenue > 1000000 ? 10 : 1;

    const riskData = {
      globalScore: 78,
      lastUpdated: new Date().toISOString(),
      fraudAlerts: [
        {
          id: "FRAUD-001",
          title: "Velocity Anomaly in Vendor Payments",
          amount: 45000 * scale,
          riskLevel: "CRITICAL",
          description: "4 identical payments to 'TechCorp' within a 12-hour window detected.",
          time: "2 hours ago"
        },
        {
          id: "FRAUD-002",
          title: "Off-hour Cash Withdrawal",
          amount: 15000 * scale,
          riskLevel: "HIGH",
          description: "Unusual cash withdrawal pattern from primary operating account at 3:00 AM.",
          time: "1 day ago"
        },
        {
          id: "FRAUD-003",
          title: "New Vendor Rapid Billing",
          amount: 85000 * scale,
          riskLevel: "MEDIUM",
          description: "Vendor 'Global Solutions' billed 3x average invoice amount within first week of creation.",
          time: "3 days ago"
        }
      ],
      macroRisks: [
        {
          factor: "Currency Fluctuations (USD/INR)",
          exposure: "HIGH",
          impact: 120000 * scale,
          trend: "UP",
          description: "Unhedged import payables exposed to recent USD appreciation."
        },
        {
          factor: "Supply Chain Inflation",
          exposure: "MEDIUM",
          impact: 85000 * scale,
          trend: "UP",
          description: "Raw material cost index rising 4.2% MoM. Margin compression expected."
        },
        {
          factor: "Interest Rate Hikes",
          exposure: "LOW",
          impact: 25000 * scale,
          trend: "STABLE",
          description: "Floating rate debt is minimal. Low exposure to RBI rate changes."
        }
      ],
      complianceForecast: [
        {
          deadline: "15 Days",
          probability: "HIGH",
          impact: "₹10,000/day Penalty",
          description: "Advance Tax Q2 Installment likely to be missed due to current cash flow trajectory."
        },
        {
          deadline: "45 Days",
          probability: "MEDIUM",
          impact: "Show-cause Notice",
          description: "GSTR-9 Annual Return reconciliation showing 12% mismatch. High scrutiny risk."
        },
        {
          deadline: "60 Days",
          probability: "LOW",
          impact: "Director Disqualification",
          description: "ROC Filing compliance requires board resolution updates."
        }
      ],
      scoreDistribution: [
        { name: "Financial Risk", value: 25 },
        { name: "Operational Risk", value: 15 },
        { name: "Compliance Risk", value: 35 },
        { name: "Market Risk", value: 25 }
      ]
    };

    return NextResponse.json(riskData);
  } catch (error: any) {
    console.error("Risk Intelligence API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
